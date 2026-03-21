using FinalSem2Project.Services;
using Microsoft.AspNetCore.Mvc;
using FinalSem2Project.Models;

namespace FinalSem2Project.Controllers
{
    public class KiteController : Controller
    {
        private readonly IKiteService kiteService;

        public KiteController(IKiteService kiteservice)
        {
            kiteService = kiteservice;
        }

        public IActionResult Connect()
        {
            if (HttpContext.Session.GetString("UserEmail") == null)
                return RedirectToAction("Login", "Account");

            var LoginUrl = kiteService.GetLoginUrl();
            var accessToken = HttpContext.Session.GetString("AccessToken");

            return View(new KiteLoginModel
            {
                LoginUrl = LoginUrl,
                IsConnected = !string.IsNullOrEmpty(accessToken)
            });
        }

        public async Task<IActionResult> Callback(string request_Token, string status)
        {
            if (HttpContext.Session.GetString("UserEmail") == null)
                return RedirectToAction("Login", "Account");

            if(status != "success" || string.IsNullOrEmpty(request_Token))
            {
                return View(new KiteCallbackModel
                {
                    Success = false,
                    Message = "Authentication was cancelled or zerodha returned error"
                });
            }

            var result = await kiteService.GenerateSession(request_Token);
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
    }
}
