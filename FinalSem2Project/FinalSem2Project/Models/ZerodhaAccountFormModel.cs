//using KiteConnect;
//using System.ComponentModel.DataAnnotations;

//namespace FinalSem2Project.Models
//{
//    public class AccountPortfolioViewModel
//    {
//        public int AccountId { get; set; }
//        public string Nickname { get; set; } = "";
//        public bool IsConnected { get; set; }
//        public List<Holding> Holdings { get; set; } = new();
//        public decimal TotalValue { get; set; }
//        public decimal TotalInvestment { get; set; }
//        public decimal TotalProfitLoss { get; set; }
//        public decimal TotalPnlPercentage { get; set; }
//    }

//    public class MultiPortfolioViewModel
//    {
//        public List<AccountPortfolioViewModel> Accounts { get; set; } = new();
//        public decimal TotalValue => Accounts.Sum(a => a.TotalValue);
//        public decimal TotalInvestment => Accounts.Sum(a => a.TotalInvestment);
//        public decimal TotalProfitLoss => Accounts.Sum(a => a.TotalProfitLoss);
//        public decimal TotalPnlPercentage =>
//            TotalInvestment > 0 ? (TotalProfitLoss / TotalInvestment) * 100 : 0;
//    }
//}