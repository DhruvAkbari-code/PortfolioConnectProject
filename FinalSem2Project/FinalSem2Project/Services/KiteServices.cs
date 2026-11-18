using FinalSem2Project.Models;
using KiteConnect;

public interface IKiteService
{
    string GetLoginUrl(string apiKey, int accountId, string baseUrl);
    Task<KiteCallbackModel> GenerateSession(string requestToken, string apiKey, string apiSecret);
    Task<PortfolioViewModel> GetPortfolio(string accessToken, string apiKey);
}

public class KiteServices : IKiteService
{
    public string GetLoginUrl(string apiKey, int accountId, string baseUrl)
    {
        // No redirect_params — Zerodha does not relay custom params back.
        // accountId is stored in session before redirecting (see ConnectAccount action).
        return $"https://kite.zerodha.com/connect/login?v=3&api_key={apiKey}";
    }

    public async Task<KiteCallbackModel> GenerateSession(string requestToken, string apiKey, string apiSecret)
    {
        if (string.IsNullOrWhiteSpace(requestToken))
            return new KiteCallbackModel { Success = false, Message = "No request token received" };

        var kite = new Kite(apiKey, Debug: false);
        KiteConnect.User user = kite.GenerateSession(requestToken, apiSecret);

        if (string.IsNullOrWhiteSpace(user.AccessToken))
            return new KiteCallbackModel { Success = false, Message = "Failed to obtain Access Token" };

        return new KiteCallbackModel
        {
            Success = true,
            AccessToken = user.AccessToken,
            Message = "Connected Successfully"
        };
    }

    public async Task<PortfolioViewModel> GetPortfolio(string accessToken, string apiKey)
    {
        if (string.IsNullOrEmpty(accessToken))
            throw new ArgumentException("Access token is required");

        var kite = new Kite(apiKey, accessToken, Debug: false);
        KiteConnect.Profile userProfile = kite.GetProfile();
        List<Holding> holdings = kite.GetHoldings() ?? new List<Holding>();

        decimal totalValue = 0, totalInvestment = 0;
        foreach (var h in holdings)
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