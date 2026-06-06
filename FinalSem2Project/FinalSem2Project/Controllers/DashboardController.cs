using FinalSem2Project.Services;
using Microsoft.AspNetCore.Mvc;
using FinalSem2Project.Models;
using FinalSem2Project.Filters;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Controllers
{
    [PremiumRequired]
    public class DashboardController : Controller
    {
        private readonly IKiteService _kiteService;
        private readonly StockMarketDbContext _db;

        public DashboardController(IKiteService kiteService, StockMarketDbContext db)
        {
            _kiteService = kiteService;
            _db = db;
        }

        public async Task<IActionResult> Index()
        {
            if (HttpContext.Session.GetString("UserEmail") == null)
                return RedirectToAction("Login", "Account");

            var accessToken = HttpContext.Session.GetString("AccessToken");
            if (string.IsNullOrEmpty(accessToken))
                return View(new PortfolioViewModel());

            var email = HttpContext.Session.GetString("UserEmail");
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);

            if (user == null || string.IsNullOrEmpty(user.ZerodhaApiKey))
                return View(new PortfolioViewModel());

            var portfolio = await _kiteService.GetPortfolio(accessToken, user.ZerodhaApiKey);
            return View(portfolio);
        }
    }
}