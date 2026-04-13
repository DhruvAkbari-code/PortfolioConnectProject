using FinalSem2Project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Controllers
{
    public class ProfileController : Controller
    {
        private readonly StockMarketDbContext _db;
        private readonly IWebHostEnvironment _env;

        public ProfileController(StockMarketDbContext db, IWebHostEnvironment env)
        {
            _db = db;
            _env = env;
        }

        private string? CurrentUserEmail => HttpContext.Session.GetString("UserEmail");

        // GET /Profile
        public async Task<IActionResult> Index()
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            // Pass some stats to the view
            ViewBag.WatchlistCount = await _db.Watchlists.CountAsync(w => w.UserId == user.Id);
            ViewBag.TargetCount = await _db.StockTargets.CountAsync(t => t.UserId == user.Id);
            ViewBag.ActiveTargets = await _db.StockTargets.CountAsync(t => t.UserId == user.Id && t.IsActive && !t.IsTriggered);

            return View(user);
        }

        // POST /Profile/UpdateInfo — updates FullName and AvatarUrl (uploaded file)
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateInfo(string fullName, IFormFile? avatarFile)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            if (string.IsNullOrWhiteSpace(fullName))
            {
                TempData["ErrorMessage"] = "Full name cannot be empty.";
                return RedirectToAction("Index");
            }

            user.FullName = fullName.Trim();

            // Handle profile picture upload
            if (avatarFile != null && avatarFile.Length > 0)
            {
                var allowed = new[] { ".jpg", ".jpeg", ".png", ".webp" };
                var ext = Path.GetExtension(avatarFile.FileName).ToLower();

                if (!allowed.Contains(ext))
                {
                    TempData["ErrorMessage"] = "Only JPG, PNG, or WEBP images are allowed.";
                    return RedirectToAction("Index");
                }

                if (avatarFile.Length > 2 * 1024 * 1024)
                {
                    TempData["ErrorMessage"] = "Image must be under 2MB.";
                    return RedirectToAction("Index");
                }

                // Save to wwwroot/uploads/avatars/
                var uploadsDir = Path.Combine(_env.WebRootPath, "uploads", "avatars");
                Directory.CreateDirectory(uploadsDir);

                // Delete old avatar if it was an uploaded one
                if (!string.IsNullOrEmpty(user.AvatarUrl) && user.AvatarUrl.StartsWith("/uploads/"))
                {
                    var oldPath = Path.Combine(_env.WebRootPath, user.AvatarUrl.TrimStart('/'));
                    if (System.IO.File.Exists(oldPath))
                        System.IO.File.Delete(oldPath);
                }

                var fileName = $"avatar_{user.Id}_{DateTime.Now.Ticks}{ext}";
                var filePath = Path.Combine(uploadsDir, fileName);

                using var stream = new FileStream(filePath, FileMode.Create);
                await avatarFile.CopyToAsync(stream);

                user.AvatarUrl = $"/uploads/avatars/{fileName}";
            }

            await _db.SaveChangesAsync();
            TempData["SuccessMessage"] = "Profile updated successfully!";
            return RedirectToAction("Index");
        }

        // POST /Profile/ChangePassword
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ChangePassword(string currentPassword, string newPassword, string confirmPassword)
        {
            if (CurrentUserEmail == null) return RedirectToAction("Login", "Account");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == CurrentUserEmail);
            if (user == null) return RedirectToAction("Login", "Account");

            // Google login users have no password
            if (string.IsNullOrEmpty(user.PasswordHash))
            {
                TempData["ErrorMessage"] = "Your account uses Google login — password change is not available.";
                return RedirectToAction("Index");
            }

            if (string.IsNullOrWhiteSpace(currentPassword) ||
                string.IsNullOrWhiteSpace(newPassword) ||
                string.IsNullOrWhiteSpace(confirmPassword))
            {
                TempData["ErrorMessage"] = "All password fields are required.";
                return RedirectToAction("Index");
            }

            if (newPassword != confirmPassword)
            {
                TempData["ErrorMessage"] = "New password and confirm password do not match.";
                return RedirectToAction("Index");
            }

            if (newPassword.Length < 6)
            {
                TempData["ErrorMessage"] = "New password must be at least 6 characters.";
                return RedirectToAction("Index");
            }

            // Verify current password — adjust hash method to match your login logic
            var currentHash = HashPassword(currentPassword);
            if (user.PasswordHash != currentHash)
            {
                TempData["ErrorMessage"] = "Current password is incorrect.";
                return RedirectToAction("Index");
            }

            user.PasswordHash = HashPassword(newPassword);
            await _db.SaveChangesAsync();

            TempData["SuccessMessage"] = "Password changed successfully!";
            return RedirectToAction("Index");
        }

        // Use the same hashing method you use in your login/register
        private string HashPassword(string password)
        {
            using var sha = System.Security.Cryptography.SHA256.Create();
            var bytes = System.Text.Encoding.UTF8.GetBytes(password);
            var hash = sha.ComputeHash(bytes);
            return Convert.ToBase64String(hash);
        }
    }
}