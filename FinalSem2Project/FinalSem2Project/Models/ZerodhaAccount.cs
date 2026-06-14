using System;
using System.Collections.Generic;

namespace FinalSem2Project.Models;

public partial class ZerodhaAccount
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Nickname { get; set; } = null!;

    public string ApiKey { get; set; } = null!;

    public string ApiSecret { get; set; } = null!;

    public string? AccessToken { get; set; }

    public DateTime? TokenGeneratedAt { get; set; }

    public DateTime CreatedAt { get; set; }
    // Add this to ZerodhaAccount.cs
    public virtual User User { get; set; } = null!;
}
