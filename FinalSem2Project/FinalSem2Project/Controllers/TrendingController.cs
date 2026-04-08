using FinalSem2Project.Services;
using Microsoft.AspNetCore.Mvc;

namespace FinalSem2Project.Controllers
{
    public class TrendingController : Controller
    {
        private readonly StockPriceService _priceService;

        public TrendingController(StockPriceService priceService)
        {
            _priceService = priceService;
        }

        public IActionResult Index()
        {
            if (HttpContext.Session.GetString("UserEmail") == null)
                return RedirectToAction("Login", "Account");

            return View();
        }

        // Called by JavaScript — returns JSON, not a View
        [HttpGet]
        public async Task<IActionResult> LiveData()
        {
            var stocks = await _priceService.GetTrendingStocksAsync();
            return Json(stocks);
        }
    }
}