using System;
using System.Collections.Generic;

namespace FinalSem2Project.Models;

public partial class StockTarget
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string StockSymbol { get; set; } = null!;

    public string StockName { get; set; } = null!;

    public string Exchange { get; set; } = null!;

    public string TargetType { get; set; } = null!;

    public decimal ConditionValue { get; set; }

    public decimal PriceAtCreation { get; set; }

    public string NotifyEmail { get; set; } = null!;

    public bool IsActive { get; set; }

    public bool IsTriggered { get; set; }

    public DateTime? TriggeredAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
