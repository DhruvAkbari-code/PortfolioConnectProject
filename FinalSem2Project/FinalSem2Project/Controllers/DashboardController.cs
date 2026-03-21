using FinalSem2Project.Services;
using Microsoft.AspNetCore.Mvc;
using FinalSem2Project.Models;

namespace FinalSem2Project.Controllers
{
    public class DashboardController : Controller
    {
        private readonly IKiteService kiteservice;

        public DashboardController(IKiteService kiteservice)
        {
            this.kiteservice = kiteservice;
        }

        public async Task<IActionResult> Index()
        {
            if (HttpContext.Session.GetString("UserEmail") == null)
                return RedirectToAction("Login", "Account");

            var accessToken = HttpContext.Session.GetString("AccessToken");

            if (string.IsNullOrEmpty(accessToken))
                return View(new PortfolioViewModel());

            var portfolio = await kiteservice.GetPortfolio(accessToken);
            return View(portfolio);
        }
    }
}
