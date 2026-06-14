using FinalSem2Project.Filters;
using FinalSem2Project.Helpers;
using FinalSem2Project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Controllers
{
    [PremiumRequired]
    public class KiteController : Controller
    {
        private readonly IKiteService _kiteService;
        private readonly StockMarketDbContext _db;

        public KiteController(IKiteService kiteService, StockMarketDbContext db)
        {
            _kiteService = kiteService;
            _db = db;
        }

        private async Task<User?> GetCurrentUserAsync()
        {
            var email = HttpContext.Session.GetString("UserEmail");
            if (email == null) return null;
            return await _db.Users
                .Include(u => u.ZerodhaAccounts)
                .FirstOrDefaultAsync(u => u.Email == email);
        }

        // ── Connect page — lists all accounts with status ─────────

        public async Task<IActionResult> Connect()
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return RedirectToAction("Login", "Account");

            var baseUrl = $"{Request.Scheme}://{Request.Host}";

            var vm = user.ZerodhaAccounts.Select(a => new KiteAccountStatusModel
            {
                Account = a,
                IsConnected = KiteSessionHelper.IsConnected(HttpContext.Session, a.Id),
                LoginUrl = _kiteService.GetLoginUrl(a.ApiKey, a.Id, baseUrl)
            }).ToList();

            return View(vm);
        }

        // ── OAuth callback — accountId comes back via redirect_params

        public async Task<IActionResult> Callback(string request_token, string status, int accountId)
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return RedirectToAction("Login", "Account");

            if (status != "success" || string.IsNullOrEmpty(request_token))
                return View(new KiteCallbackModel { Success = false, Message = "Authentication cancelled." });

            var account = user.ZerodhaAccounts.FirstOrDefault(a => a.Id == accountId);
            if (account == null)
                return View(new KiteCallbackModel { Success = false, Message = "Account not found." });

            var result = await _kiteService.GenerateSession(request_token, account.ApiKey, account.ApiSecret);

            if (result.Success)
            {
                KiteSessionHelper.SetToken(HttpContext.Session, accountId, result.AccessToken);
                ViewBag.RedirectUrl = Url.Action("Index", "Dashboard");
                ViewBag.RedirectDelay = 2000;
            }

            return View(result);
        }

        [HttpPost]
        public async Task<IActionResult> Disconnect(int accountId)
        {
            KiteSessionHelper.RemoveToken(HttpContext.Session, accountId);
            TempData["SuccessMessage"] = "Disconnected.";
            return RedirectToAction("Connect");
        }

        // ── ZerodhaSettings — list all saved accounts ─────────────

        [HttpGet]
        public async Task<IActionResult> ZerodhaSettings()
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return RedirectToAction("Login", "Account");
            return View(user.ZerodhaAccounts.ToList());
        }

        // ── Add account ───────────────────────────────────────────

        [HttpGet]
        public IActionResult AddAccount() => View(new ZerodhaAccountFormModel());

        [HttpPost]
        public async Task<IActionResult> AddAccount(ZerodhaAccountFormModel model)
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return RedirectToAction("Login", "Account");

            if (!ModelState.IsValid) return View(model);

            if (string.IsNullOrWhiteSpace(model.ApiSecret))
            {
                ModelState.AddModelError("ApiSecret", "API Secret is required for new accounts.");
                return View(model);
            }

            _db.ZerodhaAccounts.Add(new ZerodhaAccount
            {
                UserId = user.Id,
                Nickname = model.Nickname.Trim(),
                ApiKey = model.ApiKey.Trim(),
                ApiSecret = model.ApiSecret.Trim()
            });
            await _db.SaveChangesAsync();

            TempData["SuccessMessage"] = $"\"{model.Nickname}\" added.";
            return RedirectToAction("ZerodhaSettings");
        }

        // ── Edit account ──────────────────────────────────────────

        [HttpGet]
        public async Task<IActionResult> EditAccount(int id)
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return RedirectToAction("Login", "Account");

            var account = user.ZerodhaAccounts.FirstOrDefault(a => a.Id == id);
            if (account == null) return NotFound();

            return View(new ZerodhaAccountFormModel
            {
                Id = account.Id,
                Nickname = account.Nickname,
                ApiKey = account.ApiKey
                // Never prefill secret
            });
        }

        [HttpPost]
        public async Task<IActionResult> EditAccount(ZerodhaAccountFormModel model)
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return RedirectToAction("Login", "Account");

            if (!ModelState.IsValid) return View(model);

            var account = await _db.ZerodhaAccounts
                .FirstOrDefaultAsync(a => a.Id == model.Id && a.UserId == user.Id);
            if (account == null) return NotFound();

            account.Nickname = model.Nickname.Trim();
            account.ApiKey = model.ApiKey.Trim();
            if (!string.IsNullOrWhiteSpace(model.ApiSecret))
                account.ApiSecret = model.ApiSecret.Trim();

            await _db.SaveChangesAsync();
            TempData["SuccessMessage"] = "Account updated.";
            return RedirectToAction("ZerodhaSettings");
        }

        // ── Delete account ────────────────────────────────────────

        [HttpPost]
        public async Task<IActionResult> DeleteAccount(int id)
        {
            var user = await GetCurrentUserAsync();
            if (user == null) return RedirectToAction("Login", "Account");

            var account = await _db.ZerodhaAccounts
                .FirstOrDefaultAsync(a => a.Id == id && a.UserId == user.Id);

            if (account != null)
            {
                KiteSessionHelper.RemoveToken(HttpContext.Session, id);
                _db.ZerodhaAccounts.Remove(account);
                await _db.SaveChangesAsync();
            }

            TempData["SuccessMessage"] = "Account removed.";
            return RedirectToAction("ZerodhaSettings");
        }
    }
}