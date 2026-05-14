using FinalSem2Project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Razorpay.Api;

namespace FinalSem2Project.Controllers
{
    public class PremiumController : Controller
    {
        private readonly StockMarketDbContext _db;
        private readonly IConfiguration _config;

        public PremiumController(StockMarketDbContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        private string? CurrentUserEmail => HttpContext.Session.GetString("UserEmail");

        // GET /Premium/Pricing
        public async Task<IActionResult> Pricing()
        {
            // Already premium? Send them to dashboard
            if (HttpContext.Session.GetString("IsPremium") == "True")
                return RedirectToAction("Index", "Dashboard");

            if (CurrentUserEmail == null)
                return RedirectToAction("Login", "Account");

            var keyId = _config["Razorpay:KeyId"];
            ViewBag.RazorpayKeyId = keyId;

            // Create a Razorpay order (amount in paise: ₹100 = 10000)
            var client = new RazorpayClient(
                _config["Razorpay:KeyId"],
                _config["Razorpay:KeySecret"]
            );

            var options = new Dictionary<string, object>
            {
                { "amount", 10000 },        // ₹100 in paise
                { "currency", "INR" },
                { "receipt", $"premium_{DateTime.UtcNow.Ticks}" },
                { "notes", new Dictionary<string, string>
                    {
                        { "email", CurrentUserEmail! }
                    }
                }
            };

            var order = client.Order.Create(options);
            ViewBag.OrderId = order["id"].ToString();

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            return View(user);
        }

        // POST /Premium/VerifyPayment
        [HttpPost]
        public async Task<IActionResult> VerifyPayment(
            string razorpay_payment_id,
            string razorpay_order_id,
            string razorpay_signature)
        {
            if (CurrentUserEmail == null)
                return RedirectToAction("Login", "Account");

            try
            {
                // Verify signature
                var attributes = new Dictionary<string, string>
                {
                    { "razorpay_payment_id", razorpay_payment_id },
                    { "razorpay_order_id",   razorpay_order_id   },
                    { "razorpay_signature",  razorpay_signature  }
                };

                Utils.verifyPaymentSignature(attributes);

                // Signature valid — upgrade user
                var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
                if (user == null) return RedirectToAction("Login", "Account");

                user.IsPremium = true;
                user.SubscriptionStart = DateTime.UtcNow;
                user.SubscriptionEnd = DateTime.UtcNow.AddMonths(1);
                user.PaymentId = razorpay_payment_id;

                await _db.SaveChangesAsync();

                // Update session so the filter lets them through immediately
                HttpContext.Session.SetString("IsPremium", "True");

                TempData["SuccessMessage"] = "🎉 Welcome to Premium! Enjoy all features.";
                return RedirectToAction("Index", "Dashboard");
            }
            catch (Exception)
            {
                TempData["ErrorMessage"] = "Payment verification failed. Contact support with your payment ID.";
                return RedirectToAction("Pricing");
            }
        }
    }
}