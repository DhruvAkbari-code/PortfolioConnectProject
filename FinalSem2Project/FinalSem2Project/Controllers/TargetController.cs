using FinalSem2Project.Models;
using FinalSem2Project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Controllers
{
    public class TargetController : Controller
    {
        private readonly StockMarketDbContext _db;
        private readonly StockPriceService _priceService;

        public TargetController(StockMarketDbContext db, StockPriceService priceService)
        {
            _db = db;
            _priceService = priceService;
        }

        private string? CurrentUserEmail => HttpContext.Session.GetString("UserEmail");

        public async Task<IActionResult> Index()
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            var targets = await _db.StockTargets
                .Where(t => t.UserId == user.Id)
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();

            // Fetch live price for each unique symbol
            var symbols = targets.Select(t => t.StockSymbol).Distinct().ToList();
            var priceTasks = symbols.Select(async s => (s, await _priceService.GetLivePriceAsync(s)));
            var priceResults = await Task.WhenAll(priceTasks);
            var livePrices = priceResults.ToDictionary(p => p.s, p => p.Item2);

            // Auto-trigger targets whose condition is now met
            foreach (var target in targets.Where(t => t.IsActive && !t.IsTriggered))
            {
                if (!livePrices.TryGetValue(target.StockSymbol, out var price) || price == null)
                    continue;

                // Updated to work with database values
                bool triggered = target.TargetType switch
                {
                    "price_rise" => price >= target.ConditionValue,  // Price goes ABOVE condition
                    "price_fall" => price <= target.ConditionValue,  // Price goes BELOW condition
                    "percent_change" => Math.Abs((price.Value - target.PriceAtCreation) / target.PriceAtCreation * 100) >= target.ConditionValue,
                    _ => false
                };

                if (triggered)
                {
                    target.IsTriggered = true;
                    target.TriggeredAt = DateTime.Now;
                    target.UpdatedAt = DateTime.Now;
                }
            }

            await _db.SaveChangesAsync();

            ViewBag.LivePrices = livePrices;
            return View(targets);
        }

        // POST /Target/Add
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Add(string stockSymbol, string stockName, string exchange,
                                     string targetType, decimal conditionValue, string notifyEmail)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            // Convert UI targetType to database values
            targetType = targetType?.Trim().ToLower() switch
            {
                "above" => "price_rise",      // When price goes ABOVE condition -> price RISE
                "below" => "price_fall",      // When price goes BELOW condition -> price FALL
                "percent" or "percentage" => "percent_change",
                "price_rise" => "price_rise", // Already in correct format
                "price_fall" => "price_fall", // Already in correct format
                "percent_change" => "percent_change", // Already in correct format
                _ => "price_rise"  // Default to price_rise
            };

            // Validate the converted value
            var allowedTypes = new[] { "price_rise", "price_fall", "percent_change" };
            if (!allowedTypes.Contains(targetType))
            {
                TempData["ErrorMessage"] = "Invalid target type. Must be 'above' or 'below'.";
                return RedirectToAction("Index");
            }

            // Duplicate check
            var exists = await _db.StockTargets.AnyAsync(t =>
                t.UserId == user.Id &&
                t.StockSymbol == stockSymbol.Trim().ToUpper() &&
                t.TargetType == targetType &&
                t.ConditionValue == conditionValue &&
                t.IsActive);

            if (exists)
            {
                TempData["ErrorMessage"] = "An identical active target already exists for this stock.";
                return RedirectToAction("Index");
            }

            var livePrice = await _priceService.GetLivePriceAsync(stockSymbol.Trim().ToUpper());

            _db.StockTargets.Add(new StockTarget
            {
                UserId = user.Id,
                StockSymbol = stockSymbol.Trim().ToUpper(),
                StockName = stockName?.Trim() ?? stockSymbol.ToUpper(),
                Exchange = exchange ?? "NSE",
                TargetType = targetType,  // Now using 'price_rise' or 'price_fall'
                ConditionValue = conditionValue,
                PriceAtCreation = livePrice ?? 0,
                NotifyEmail = notifyEmail?.Trim() ?? CurrentUserEmail,
                IsActive = true,
                IsTriggered = false,
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now
            });

            await _db.SaveChangesAsync();
            TempData["SuccessMessage"] = $"Target set for {stockSymbol.ToUpper()}!";
            return RedirectToAction("Index");
        }

        // POST /Target/Delete
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            var target = await _db.StockTargets
                .FirstOrDefaultAsync(t => t.Id == id && t.UserId == user.Id);

            if (target != null)
            {
                _db.StockTargets.Remove(target);
                await _db.SaveChangesAsync();
                TempData["SuccessMessage"] = "Target deleted.";
            }

            return RedirectToAction("Index");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ToggleActive(int id)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            var target = await _db.StockTargets
                .FirstOrDefaultAsync(t => t.Id == id && t.UserId == user.Id);

            if (target != null)
            {
                target.IsActive = !target.IsActive;
                target.UpdatedAt = DateTime.Now;
                await _db.SaveChangesAsync();
            }

            return RedirectToAction("Index");
        }
    }
}