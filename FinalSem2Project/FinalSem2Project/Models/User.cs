using System;
using System.Collections.Generic;

namespace FinalSem2Project.Models;

public partial class User
{
    public int Id { get; set; }

    public string Email { get; set; } = null!;

    public string? PasswordHash { get; set; }

    public string FullName { get; set; } = null!;

    public string? AvatarUrl { get; set; }

    public string? GoogleId { get; set; }

    public bool IsActive { get; set; }

    public bool EmailVerified { get; set; }

    public bool IsPremium { get; set; }

    public DateTime? SubscriptionStart { get; set; }

    public DateTime? SubscriptionEnd { get; set; }

    public string? PaymentId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? LastLoginAt { get; set; }

    public virtual ICollection<StockTarget> StockTargets { get; set; } = new List<StockTarget>();

    public virtual ICollection<Watchlist> Watchlists { get; set; } = new List<Watchlist>();
}
