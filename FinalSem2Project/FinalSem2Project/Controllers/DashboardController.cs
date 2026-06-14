using FinalSem2Project.Filters;
using FinalSem2Project.Helpers;
using FinalSem2Project.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Controllers
{
    [PremiumRequired]
    public class DashboardController : Controller
    {
        private readonly IKiteService _kiteService;
        private readonly StockMarketDbContext _db;

        public DashboardController(IKiteService kiteService, StockMarketDbContext db)
        {
            _kiteService = kiteService;
            _db = db;
        }

        public async Task<IActionResult> Index()
        {
            if (HttpContext.Session.GetString("UserEmail") == null)
                return RedirectToAction("Login", "Account");

            var email = HttpContext.Session.GetString("UserEmail");
            var user = await _db.Users
                .Include(u => u.ZerodhaAccounts)
                .FirstOrDefaultAsync(u => u.Email == email);

            if (user == null)
                return View(new MultiPortfolioViewModel());

            var tokens = KiteSessionHelper.GetTokens(HttpContext.Session);
            var vm = new MultiPortfolioViewModel();

            var tasks = user.ZerodhaAccounts.Select(async account =>
            {
                var accVm = new AccountPortfolioViewModel
                {
                    AccountId = account.Id,
                    Nickname = account.Nickname,
                    IsConnected = tokens.ContainsKey(account.Id)
                };

                if (accVm.IsConnected)
                {
                    try
                    {
                        var portfolio = await _kiteService.GetPortfolio(
                            tokens[account.Id], account.ApiKey);

                        accVm.Holdings = portfolio.Holdings;
                        accVm.TotalValue = portfolio.TotalValue;
                        accVm.TotalInvestment = portfolio.TotalInvestment;
                        accVm.TotalProfitLoss = portfolio.TotalProfitLoss;
                        accVm.TotalPnlPercentage = portfolio.TotalPnlPercentage;
                    }
                    catch
                    {
                        // Token expired — clear it so user sees reconnect prompt
                        KiteSessionHelper.RemoveToken(HttpContext.Session, account.Id);
                        accVm.IsConnected = false;
                    }
                }

                return accVm;
            });

            vm.Accounts = (await Task.WhenAll(tasks)).ToList();
            return View(vm);
        }
    }
}