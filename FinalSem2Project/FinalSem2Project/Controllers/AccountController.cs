using FinalSem2Project.Models;
using Microsoft.AspNetCore.Mvc;

namespace FinalSem2Project.Controllers
{
    public class AccountController : Controller
    {
        private readonly StockMarketDbContext context;

        public AccountController(StockMarketDbContext dbcontext)
        {
            context = dbcontext;          
        }

        public IActionResult Login()
        {
            if (HttpContext.Session.GetInt32("UserEmail") != null)
                return RedirectToAction("Index", "Dashboard");

            return View();
        }

        [HttpPost]
        public IActionResult Login(String email, string password)
        {
            
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                TempData["ErrorMessage"] = "Email and Password are required";
                return View();
            }

            var user = context.Users.FirstOrDefault(u => u.Email.ToLower() == email.ToLower() && u.IsActive);

            if(user == null)
            {
                TempData["ErrorMessage"] = "Invalid Email or Password";
                return View();
            }

            if (string.IsNullOrEmpty(user.PasswordHash))
            {
                TempData["ErrorMessage"] = "This Account has Google Sign-In. Login with Google";
                return View();
            }

            if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            {
                TempData["ErrorMessage"] = "Invalid Email or Password";
                return View();
            }

            user.LastLoginAt = DateTime.UtcNow;
            context.SaveChanges();

            HttpContext.Session.SetInt32("UserId", user.Id);
            HttpContext.Session.SetString("UserEmail", user.Email);
            HttpContext.Session.SetString("UserFullName", user.FullName);
            HttpContext.Session.SetString("IsPremium", user.IsPremium.ToString());

            return RedirectToAction("Index", "Dashboard");
        }

        public IActionResult Register()
        {
            if(HttpContext.Session.GetInt32("UserId") != null)
            {
                return RedirectToAction("Index", "Dashboard");
            }
            return View();
        }
        [HttpPost]
        public IActionResult Register(string fullname, string email, string password)
        {
            if(string.IsNullOrEmpty(fullname) || string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                TempData["ErrorMessage"] = "All fields are required";
                return View();
            }
            if(password.Length < 6)
            {
                TempData["ErrorMessage"] = "Password must be at least 6 characters long";
                return View();
            }

            var existingUser = context.Users.FirstOrDefault(u => u.Email.ToLower() == email.ToLower());
            if(existingUser != null)
            {
                TempData["ErrorMessage"] = "Email is Already Registered";
                return View();
            }

            var user = new User
            {
                Email = email.Trim().ToLower(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                FullName = fullname,
                IsActive = true,
                EmailVerified = false,
                IsPremium = false,
                CreatedAt = DateTime.UtcNow,
                AvatarUrl = null,
                GoogleId = null,
                SubscriptionStart = null,
                SubscriptionEnd = null,
                PaymentId = null,
                LastLoginAt = null
            };

            context.Users.Add(user);
            context.SaveChanges();

            return RedirectToAction("Login");
        }
    }
}
