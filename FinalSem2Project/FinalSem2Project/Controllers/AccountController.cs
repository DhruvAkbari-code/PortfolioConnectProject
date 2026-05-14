using FinalSem2Project.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace FinalSem2Project.Controllers
{
    public class AccountController : Controller
    {
        private readonly StockMarketDbContext _context;

        public AccountController(StockMarketDbContext dbContext)
        {
            _context = dbContext;
        }

        // ── Login ────────────────────────────────────────────────────

        public IActionResult Login()
        {
            if (HttpContext.Session.GetString("UserEmail") != null)
                return RedirectToAction("Index", "Trending");
            return View();
        }

        [HttpPost]
        public IActionResult Login(string email, string password)
        {
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            {
                TempData["ErrorMessage"] = "Email and password are required.";
                return View();
            }

            var user = _context.Users
                .FirstOrDefault(u => u.Email.ToLower() == email.Trim().ToLower() && u.IsActive);

            if (user == null)
            {
                TempData["ErrorMessage"] = "No account found with that email.";
                return View();
            }

            if (string.IsNullOrEmpty(user.PasswordHash))
            {
                TempData["ErrorMessage"] = "This account uses Google Sign-In. Please continue with Google.";
                return View();
            }

            if (!BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            {
                TempData["ErrorMessage"] = "Incorrect password. Please try again.";
                return View();
            }

            SetSession(user);
            user.LastLoginAt = DateTime.UtcNow;
            _context.SaveChanges();

            return RedirectToAction("Index", "Trending");
        }

        // ── Register ─────────────────────────────────────────────────

        public IActionResult Register()
        {
            if (HttpContext.Session.GetString("UserEmail") != null)
                return RedirectToAction("Index", "Trending");
            return View();
        }

        [HttpPost]
        public IActionResult Register(string fullname, string email, string password)
        {
            // Presence check
            if (string.IsNullOrWhiteSpace(fullname) ||
                string.IsNullOrWhiteSpace(email) ||
                string.IsNullOrWhiteSpace(password))
            {
                TempData["ErrorMessage"] = "All fields are required.";
                return View();
            }

            // Full name length
            if (fullname.Trim().Length < 2)
            {
                TempData["ErrorMessage"] = "Please enter your full name (at least 2 characters).";
                return View();
            }

            // Basic email format guard (HTML5 handles most, this catches edge cases)
            if (!email.Contains('@') || !email.Contains('.'))
            {
                TempData["ErrorMessage"] = "Please enter a valid email address.";
                return View();
            }

            // Password length
            if (password.Length < 6)
            {
                TempData["ErrorMessage"] = "Password must be at least 6 characters.";
                return View();
            }

            // ── Email already registered ──────────────────────────────
            var existing = _context.Users
                .FirstOrDefault(u => u.Email.ToLower() == email.Trim().ToLower());

            if (existing != null)
            {
                // Tell the user WHY and how to proceed
                if (string.IsNullOrEmpty(existing.PasswordHash))
                    TempData["ErrorMessage"] = "This email is already registered via Google. Please sign in with Google.";
                else
                    TempData["ErrorMessage"] = "This email is already registered. Try signing in instead.";

                return View();
            }
            // ─────────────────────────────────────────────────────────

            var user = new User
            {
                Email = email.Trim().ToLower(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                FullName = fullname.Trim(),
                IsActive = true,
                EmailVerified = false,
                IsPremium = false,
                CreatedAt = DateTime.UtcNow,
            };

            _context.Users.Add(user);
            _context.SaveChanges();

            TempData["SuccessMessage"] = "Account created! Please sign in.";
            return RedirectToAction("Login");
        }

        // ── Google OAuth ─────────────────────────────────────────────

        public IActionResult GoogleLogin()
        {
            var props = new AuthenticationProperties
            {
                RedirectUri = Url.Action("GoogleCallback", "Account")
            };
            return Challenge(props, "Google");
        }

        public async Task<IActionResult> GoogleCallback()
        {
            // Read the external login info from the cookie set by the middleware
            var result = await HttpContext.AuthenticateAsync("Cookies");

            if (!result.Succeeded)
            {
                TempData["ErrorMessage"] = "Google sign-in failed. Please try again.";
                return RedirectToAction("Login");
            }

            var claims = result.Principal!.Claims;
            var googleId = claims.FirstOrDefault(c => c.Type == ClaimTypes.NameIdentifier)?.Value;
            var email = claims.FirstOrDefault(c => c.Type == ClaimTypes.Email)?.Value;
            var fullName = claims.FirstOrDefault(c => c.Type == ClaimTypes.Name)?.Value;
            var avatarUrl = claims.FirstOrDefault(c => c.Type == "urn:google:picture")?.Value
                         ?? claims.FirstOrDefault(c => c.Type == "picture")?.Value;

            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(googleId))
            {
                TempData["ErrorMessage"] = "Could not retrieve your Google account details.";
                return RedirectToAction("Login");
            }

            // Find or create the user
            var user = _context.Users.FirstOrDefault(u => u.Email.ToLower() == email.ToLower());

            if (user == null)
            {
                // First-time Google sign-in → auto-register
                user = new User
                {
                    Email = email.ToLower(),
                    FullName = fullName ?? email,
                    AvatarUrl = avatarUrl,
                    GoogleId = googleId,
                    IsActive = true,
                    EmailVerified = true,   // Google already verified it
                    IsPremium = false,
                    CreatedAt = DateTime.UtcNow,
                };
                _context.Users.Add(user);
            }
            else
            {
                // Existing user — link Google ID if not already set
                if (string.IsNullOrEmpty(user.GoogleId))
                    user.GoogleId = googleId;

                if (string.IsNullOrEmpty(user.AvatarUrl) && avatarUrl != null)
                    user.AvatarUrl = avatarUrl;
            }

            user.LastLoginAt = DateTime.UtcNow;
            _context.SaveChanges();

            // Sign the external cookie out so it doesn't persist
            await HttpContext.SignOutAsync("Cookies");

            SetSession(user);
            return RedirectToAction("Index", "Trending");
        }

        // ── Logout ───────────────────────────────────────────────────

        public IActionResult Logout()
        {
            HttpContext.Session.Clear();
            return RedirectToAction("Login", "Account");
        }

        // ── Helper ───────────────────────────────────────────────────

        private void SetSession(User user)
        {
            HttpContext.Session.SetInt32("UserId", user.Id);
            HttpContext.Session.SetString("UserEmail", user.Email);
            HttpContext.Session.SetString("UserFullName", user.FullName);
            HttpContext.Session.SetString("IsPremium", user.IsPremium.ToString());
        }



        // GET /Account/ForgotPassword
        public IActionResult ForgotPassword()
        {
            return View();
        }

        // POST /Account/ForgotPassword — verify email exists
        [HttpPost]
        public IActionResult ForgotPassword(string email)
        {
            if (string.IsNullOrWhiteSpace(email))
            {
                TempData["ErrorMessage"] = "Please enter your email address.";
                return View();
            }

            var user = _context.Users
                .FirstOrDefault(u => u.Email.ToLower() == email.Trim().ToLower() && u.IsActive);

            if (user == null)
            {
                TempData["ErrorMessage"] = "No account found with that email address.";
                return View();
            }

            if (!string.IsNullOrEmpty(user.GoogleId) && string.IsNullOrEmpty(user.PasswordHash))
            {
                TempData["ErrorMessage"] = "This account uses Google Sign-In. No password to reset.";
                return View();
            }

            // Store email in session temporarily to verify on reset page
            HttpContext.Session.SetString("ResetEmail", email.Trim().ToLower());
            return RedirectToAction("ResetPassword");
        }

        // GET /Account/ResetPassword
        public IActionResult ResetPassword()
        {
            // Must have come through ForgotPassword — no direct access
            if (HttpContext.Session.GetString("ResetEmail") == null)
                return RedirectToAction("ForgotPassword");

            return View();
        }

        // POST /Account/ResetPassword
        [HttpPost]
        public IActionResult ResetPassword(string newPassword, string confirmPassword)
        {
            var email = HttpContext.Session.GetString("ResetEmail");

            if (string.IsNullOrEmpty(email))
            {
                TempData["ErrorMessage"] = "Session expired. Please start again.";
                return RedirectToAction("ForgotPassword");
            }

            if (string.IsNullOrWhiteSpace(newPassword) || string.IsNullOrWhiteSpace(confirmPassword))
            {
                TempData["ErrorMessage"] = "Both fields are required.";
                return View();
            }

            if (newPassword.Length < 6)
            {
                TempData["ErrorMessage"] = "Password must be at least 6 characters.";
                return View();
            }

            if (newPassword != confirmPassword)
            {
                TempData["ErrorMessage"] = "Passwords do not match.";
                return View();
            }

            var user = _context.Users.FirstOrDefault(u => u.Email == email);
            if (user == null)
            {
                TempData["ErrorMessage"] = "User not found. Please try again.";
                return RedirectToAction("ForgotPassword");
            }

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
            _context.SaveChanges();

            // Clear reset session key
            HttpContext.Session.Remove("ResetEmail");

            TempData["SuccessMessage"] = "Password reset successfully! Please sign in.";
            return RedirectToAction("Login");
        }
    }
}