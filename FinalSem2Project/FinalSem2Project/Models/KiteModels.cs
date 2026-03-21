using KiteConnect;

namespace FinalSem2Project.Models
{
    public class KiteLoginModel
    {
        public string LoginUrl { get; set; }
        public bool IsConnected { get; set; }
    }

    public class KiteCallbackModel
    {
        public bool Success { get; set; }
        public string Message { get; set; }
        public string AccessToken { get; set; }
    }

    public class PortfolioViewModel
    {
        public List<Holding> Holdings { get; set; }
        public decimal TotalValue { get; set; }
        public decimal TotalInvestment { get; set; }
        public decimal TotalProfitLoss { get; set; }
        public decimal TotalPnlPercentage { get; set; }
    }

    public class ZerodhaSettings
    {
        public string ApiKey { get; set; }
        public string ApiSecret { get; set; }
        public string RedirctUrl { get; set; }
    }

}
