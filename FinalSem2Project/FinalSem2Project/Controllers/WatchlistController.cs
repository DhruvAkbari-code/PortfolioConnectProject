using FinalSem2Project.Models;
using FinalSem2Project.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Controllers
{
    public class WatchlistController : Controller
    {
        private readonly StockMarketDbContext _db;
        private readonly StockPriceService _priceService;

        public WatchlistController(StockMarketDbContext db, StockPriceService priceService)
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

            var items = await _db.Watchlists
                .Where(w => w.UserId == user.Id)
                .ToListAsync();

            var quoteTasks = items.Select(async item =>
            {
                var quote = await _priceService.GetLiveQuoteAsync(item.StockSymbol);
                return (item.StockSymbol, quote);
            });

            var quotes = await Task.WhenAll(quoteTasks);
            ViewBag.LiveQuotes = quotes.ToDictionary(q => q.StockSymbol, q => q.quote);

            return View(items);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Add(string stockSymbol, string stockName, string exchange)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            // Check if this symbol already exists in this user's watchlist
            var exists = await _db.Watchlists.AnyAsync(w =>
                w.UserId == user.Id &&
                w.StockSymbol == stockSymbol.Trim().ToUpper());

            if (exists)
            {
                TempData["ErrorMessage"] = $"{stockSymbol.ToUpper()} is already in your watchlist.";
                return RedirectToAction("Index");
            }

            var livePrice = await _priceService.GetLivePriceAsync(stockSymbol);

            _db.Watchlists.Add(new Watchlist
            {
                UserId = user.Id,
                StockSymbol = stockSymbol.Trim().ToUpper(),
                StockName = !string.IsNullOrWhiteSpace(stockName) ? stockName.Trim() : stockSymbol.Trim().ToUpper(),
                Exchange = exchange ?? "NSE",
                PriceAtAdd = livePrice,
                AddedAt = DateTime.Now
            });

            await _db.SaveChangesAsync();
            TempData["SuccessMessage"] = $"{stockSymbol.ToUpper()} added to watchlist!";
            return RedirectToAction("Index");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> AddFromTrending(string stockSymbol, string stockName, string exchange)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            var exists = await _db.Watchlists.AnyAsync(w =>
                w.UserId == user.Id &&
                w.StockSymbol == stockSymbol.Trim().ToUpper());

            if (exists)
            {
                TempData["ErrorMessage"] = $"{stockSymbol.ToUpper()} is already in your watchlist.";
                return RedirectToAction("Index", "Watchlist");
            }

            var livePrice = await _priceService.GetLivePriceAsync(stockSymbol);

            _db.Watchlists.Add(new Watchlist
            {
                UserId = user.Id,
                StockSymbol = stockSymbol.Trim().ToUpper(),
                StockName = !string.IsNullOrWhiteSpace(stockName) ? stockName.Trim() : stockSymbol.Trim().ToUpper(),
                Exchange = exchange ?? "NSE",
                PriceAtAdd = livePrice,
                AddedAt = DateTime.Now
            });

            await _db.SaveChangesAsync();
            TempData["SuccessMessage"] = $"{stockSymbol.ToUpper()} added to watchlist!";
            return RedirectToAction("Index", "Watchlist");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Remove(int id)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            var item = await _db.Watchlists.FirstOrDefaultAsync(w => w.Id == id && w.UserId == user.Id);
            if (item != null)
            {
                _db.Watchlists.Remove(item);
                await _db.SaveChangesAsync();
            }

            TempData["SuccessMessage"] = "Removed from watchlist.";
            return RedirectToAction("Index");
        }
    }
}