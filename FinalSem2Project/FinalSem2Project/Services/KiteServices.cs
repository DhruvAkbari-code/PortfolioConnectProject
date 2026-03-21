using KiteConnect;
using FinalSem2Project.Models;
using Microsoft.Extensions.Options;
namespace FinalSem2Project.Services
{
    public interface IKiteService
    {
        string GetLoginUrl();
        Task<KiteCallbackModel> GenerateSession(string requestToken);
        Task<PortfolioViewModel> GetPortfolio(string accessToken);
    }
    public class KiteServices : IKiteService
    {
        private readonly ZerodhaSettings settings;

        public KiteServices(IOptions<ZerodhaSettings> ZerodhaSetting)
        {
            settings = ZerodhaSetting.Value;
        }

        public string GetLoginUrl()
        {
            return $"https://kite.zerodha.com/connect/login?v=3&api_key={Uri.EscapeDataString(settings.ApiKey)}";
        }

        public async Task<KiteCallbackModel> GenerateSession(string requestToken)
        {
            if (string.IsNullOrWhiteSpace(requestToken))
            {
                return new KiteCallbackModel { Success = false, Message = "No request token received" };
            }

            var kite = new Kite(settings.ApiKey, Debug: false);

            KiteConnect.User user = kite.GenerateSession(requestToken, settings.ApiSecret);

            if (string.IsNullOrWhiteSpace(user.AccessToken))
            {
                return new KiteCallbackModel { Success = false, Message = "Failed to obtain Access" };
            }

            return new KiteCallbackModel
            {
                Success = true,
                AccessToken = user.AccessToken,
                Message = "Connected Successfully"
            };


        }

        public async Task<PortfolioViewModel> GetPortfolio(string accessToken)
        {
            if (string.IsNullOrEmpty(accessToken))
            {
                throw new ArgumentException("Access token is required");
            }
            var kite = new Kite(settings.ApiKey, accessToken, Debug: false);

            KiteConnect.Profile userProfile = kite.GetProfile();

            List<Holding> holdings = kite.GetHoldings() ?? new List<Holding>();

            decimal totalValue = 0;
            decimal totalInvestment = 0;

            foreach(var h in holdings)
            {
                totalValue += (decimal)(h.LastPrice * h.Quantity);
                totalInvestment += (decimal)(h.AveragePrice * h.Quantity);
            }

            decimal totalProfit = totalValue - totalInvestment;
            decimal totalPnlPercentage = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;

            return new PortfolioViewModel
            {
                Holdings = holdings,
                TotalValue = totalValue,
                TotalProfitLoss = totalProfit,
                TotalInvestment = totalInvestment,
                TotalPnlPercentage = totalPnlPercentage
            };
        }

    }
}
