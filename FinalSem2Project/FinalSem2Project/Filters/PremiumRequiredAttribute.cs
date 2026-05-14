using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace FinalSem2Project.Filters
{
    public class PremiumRequiredAttribute : ActionFilterAttribute
    {
        public override void OnActionExecuting(ActionExecutingContext context)
        {
            var session = context.HttpContext.Session;

            // Must be logged in
            if (session.GetString("UserEmail") == null)
            {
                context.Result = new RedirectToActionResult("Login", "Account", null);
                return;
            }

            // Must be premium
            var isPremium = session.GetString("IsPremium");
            if (isPremium != "True")
            {
                context.Result = new RedirectToActionResult("Pricing", "Premium", null);
                return;
            }

            base.OnActionExecuting(context);
        }
    }
}