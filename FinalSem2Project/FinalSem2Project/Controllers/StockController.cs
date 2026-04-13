using Microsoft.AspNetCore.Mvc;

namespace FinalSem2Project.Controllers
{
    public class StockController : Controller
    {
        private string? CurrentUserEmail => HttpContext.Session.GetString("UserEmail");

        public IActionResult Index(string symbol)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");
            if (string.IsNullOrWhiteSpace(symbol)) return RedirectToAction("Index", "Dashboard");
            ViewBag.Symbol = symbol.Trim().ToUpper();
            return View();
        }
    }
}