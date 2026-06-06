using FinalSem2Project.Filters;
using FinalSem2Project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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

    // Helper — gets the logged-in user or null
    private async Task<User?> GetCurrentUserAsync()
    {
        var email = HttpContext.Session.GetString("UserEmail");
        if (email == null) return null;
        return await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
    }

    public async Task<IActionResult> Connect()
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return RedirectToAction("Login", "Account");

        // If user hasn't set keys yet, send them to Settings
        if (string.IsNullOrEmpty(user.ZerodhaApiKey))
        {
            TempData["InfoMessage"] = "Please enter your Zerodha API key first.";
            return RedirectToAction("ZerodhaSettings");
        }

        var loginUrl = _kiteService.GetLoginUrl(user.ZerodhaApiKey);
        var accessToken = HttpContext.Session.GetString("AccessToken");

        return View(new KiteLoginModel
        {
            LoginUrl = loginUrl,
            IsConnected = !string.IsNullOrEmpty(accessToken)
        });
    }

    public async Task<IActionResult> Callback(string request_Token, string status)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return RedirectToAction("Login", "Account");

        if (status != "success" || string.IsNullOrEmpty(request_Token))
            return View(new KiteCallbackModel { Success = false, Message = "Authentication cancelled or Zerodha returned an error." });

        if (string.IsNullOrEmpty(user.ZerodhaApiKey) || string.IsNullOrEmpty(user.ZerodhaApiSecret))
            return View(new KiteCallbackModel { Success = false, Message = "Zerodha API keys not configured. Please go to Settings." });

        var result = await _kiteService.GenerateSession(request_Token, user.ZerodhaApiKey, user.ZerodhaApiSecret);
        if (result.Success)
        {
            HttpContext.Session.SetString("AccessToken", result.AccessToken);
            ViewBag.RedirectUrl = Url.Action("Index", "Dashboard");
            ViewBag.RedirectDelay = 2000;
        }

        return View(result);
    }

    [HttpPost]
    public IActionResult Disconnect()
    {
        HttpContext.Session.Remove("AccessToken");
        TempData["SuccessMessage"] = "Disconnected from Zerodha";
        return RedirectToAction("Connect");
    }

    // ── Zerodha Settings ──────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> ZerodhaSettings()
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return RedirectToAction("Login", "Account");

        return View(new ZerodhaUserKeysModel
        {
            ApiKey = user.ZerodhaApiKey,
            // Never prefill the secret for security
        });
    }

    [HttpPost]
    public async Task<IActionResult> ZerodhaSettings(ZerodhaUserKeysModel model)
    {
        var user = await GetCurrentUserAsync();
        if (user == null) return RedirectToAction("Login", "Account");

        if (!ModelState.IsValid) return View(model);

        user.ZerodhaApiKey = model.ApiKey?.Trim();
        user.ZerodhaApiSecret = model.ApiSecret?.Trim();
        await _db.SaveChangesAsync();

        TempData["SuccessMessage"] = "Zerodha API keys saved successfully.";
        return RedirectToAction("Connect");
    }
}
