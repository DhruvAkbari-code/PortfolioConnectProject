using FinalSem2Project.Models;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Middleware
{
    public class SubscriptionExpiryMiddleware
    {
        private readonly RequestDelegate _next;

        public SubscriptionExpiryMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context, StockMarketDbContext db)
        {
            var email = context.Session.GetString("UserEmail");

            if (!string.IsNullOrEmpty(email))
            {
                // Only check if session currently says premium
                var sessionIsPremium = context.Session.GetString("IsPremium") == "True";

                if (sessionIsPremium)
                {
                    var user = await db.Users
                        .FirstOrDefaultAsync(u => u.Email == email);

                    if (user != null)
                    {
                        // Subscription expired?
                        bool expired = user.IsPremium &&
                                       user.SubscriptionEnd.HasValue &&
                                       user.SubscriptionEnd.Value < DateTime.UtcNow;

                        if (expired)
                        {
                            // Reset in DB
                            user.IsPremium = false;
                            await db.SaveChangesAsync();

                            // Reset in session
                            context.Session.SetString("IsPremium", "False");
                        }
                    }
                }
            }

            await _next(context);
        }
    }
}