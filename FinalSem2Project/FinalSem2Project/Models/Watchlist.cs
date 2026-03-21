using System;
using System.Collections.Generic;

namespace FinalSem2Project.Models;

public partial class Watchlist
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string StockSymbol { get; set; } = null!;

    public string StockName { get; set; } = null!;

    public string Exchange { get; set; } = null!;

    public decimal? PriceAtAdd { get; set; }

    public DateTime AddedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
