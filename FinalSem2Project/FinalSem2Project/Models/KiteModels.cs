using System.ComponentModel.DataAnnotations;
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

    // ── Single-account (kept for backward compat) ─────────────
    public class PortfolioViewModel
    {
        public List<Holding> Holdings { get; set; }
        public decimal TotalValue { get; set; }
        public decimal TotalInvestment { get; set; }
        public decimal TotalProfitLoss { get; set; }
        public decimal TotalPnlPercentage { get; set; }
    }

    // ── Multi-account models ──────────────────────────────────

    public class KiteAccountStatusModel
    {
        public ZerodhaAccount Account { get; set; } = null!;
        public bool IsConnected { get; set; }
        public string LoginUrl { get; set; } = "";
    }

    public class AccountPortfolioViewModel
    {
        public int AccountId { get; set; }
        public string Nickname { get; set; } = "";
        public bool IsConnected { get; set; }
        public List<Holding> Holdings { get; set; } = new();
        public decimal TotalValue { get; set; }
        public decimal TotalInvestment { get; set; }
        public decimal TotalProfitLoss { get; set; }
        public decimal TotalPnlPercentage { get; set; }
    }

    public class MultiPortfolioViewModel
    {
        public List<AccountPortfolioViewModel> Accounts { get; set; } = new();
        public decimal TotalValue => Accounts.Sum(a => a.TotalValue);
        public decimal TotalInvestment => Accounts.Sum(a => a.TotalInvestment);
        public decimal TotalProfitLoss => Accounts.Sum(a => a.TotalProfitLoss);
        public decimal TotalPnlPercentage =>
            TotalInvestment > 0 ? (TotalProfitLoss / TotalInvestment) * 100 : 0;
    }

    // ── Legacy settings model (kept if referenced elsewhere) ──
    public class ZerodhaSettings
    {
        public string ApiKey { get; set; }
        public string ApiSecret { get; set; }
        public string RedirctUrl { get; set; }
    }

    public class ZerodhaUserKeysModel
    {
        [Required(ErrorMessage = "API Key is required")]
        public string? ApiKey { get; set; }

        [Required(ErrorMessage = "API Secret is required")]
        public string? ApiSecret { get; set; }
    }

    public class ZerodhaAccountFormModel
    {
        public int Id { get; set; }  // 0 = new

        [Required(ErrorMessage = "Nickname is required")]
        [Display(Name = "Nickname")]
        public string Nickname { get; set; } = "";

        [Required(ErrorMessage = "API Key is required")]
        [Display(Name = "API Key")]
        public string ApiKey { get; set; } = "";

        [Display(Name = "API Secret")]
        public string? ApiSecret { get; set; }  // blank = keep existing
    }
}