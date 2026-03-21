using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace FinalSem2Project.Models;

public partial class StockMarketDbContext : DbContext
{
    public StockMarketDbContext()
    {
    }

    public StockMarketDbContext(DbContextOptions<StockMarketDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<StockTarget> StockTargets { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<Watchlist> Watchlists { get; set; }

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
#warning To protect potentially sensitive information in your connection string, you should move it out of source code. You can avoid scaffolding the connection string by using the Name= syntax to read it from configuration - see https://go.microsoft.com/fwlink/?linkid=2131148. For more guidance on storing connection strings, see https://go.microsoft.com/fwlink/?LinkId=723263.
        => optionsBuilder.UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=StockMarketDb;Trusted_Connection=True;");

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<StockTarget>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__stock_ta__3213E83FA5330523");

            entity.ToTable("stock_targets");

            entity.HasIndex(e => e.IsActive, "ix_targets_active").HasFilter("([is_active]=(1))");

            entity.HasIndex(e => e.UserId, "ix_targets_userid");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ConditionValue)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("condition_value");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(getutcdate())")
                .HasColumnName("created_at");
            entity.Property(e => e.Exchange)
                .HasMaxLength(10)
                .HasDefaultValue("NSE")
                .HasColumnName("exchange");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.IsTriggered).HasColumnName("is_triggered");
            entity.Property(e => e.NotifyEmail)
                .HasMaxLength(255)
                .HasColumnName("notify_email");
            entity.Property(e => e.PriceAtCreation)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("price_at_creation");
            entity.Property(e => e.StockName)
                .HasMaxLength(200)
                .HasColumnName("stock_name");
            entity.Property(e => e.StockSymbol)
                .HasMaxLength(50)
                .HasColumnName("stock_symbol");
            entity.Property(e => e.TargetType)
                .HasMaxLength(30)
                .HasDefaultValue("price_rise")
                .HasColumnName("target_type");
            entity.Property(e => e.TriggeredAt).HasColumnName("triggered_at");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("(getutcdate())")
                .HasColumnName("updated_at");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.StockTargets)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK__stock_tar__user___5812160E");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__users__3213E83FD2097293");

            entity.ToTable("users");

            entity.HasIndex(e => e.Email, "uq_users_email").IsUnique();

            entity.HasIndex(e => e.GoogleId, "uq_users_googleid").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AvatarUrl)
                .HasMaxLength(500)
                .HasColumnName("avatar_url");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("(getutcdate())")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(255)
                .HasColumnName("email");
            entity.Property(e => e.EmailVerified).HasColumnName("email_verified");
            entity.Property(e => e.FullName)
                .HasMaxLength(150)
                .HasColumnName("full_name");
            entity.Property(e => e.GoogleId)
                .HasMaxLength(100)
                .HasColumnName("google_id");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.IsPremium).HasColumnName("is_premium");
            entity.Property(e => e.LastLoginAt).HasColumnName("last_login_at");
            entity.Property(e => e.PasswordHash)
                .HasMaxLength(255)
                .HasColumnName("password_hash");
            entity.Property(e => e.PaymentId)
                .HasMaxLength(255)
                .HasColumnName("payment_id");
            entity.Property(e => e.SubscriptionEnd).HasColumnName("subscription_end");
            entity.Property(e => e.SubscriptionStart).HasColumnName("subscription_start");
        });

        modelBuilder.Entity<Watchlist>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PK__watchlis__3213E83FCA9DF383");

            entity.ToTable("watchlist");

            entity.HasIndex(e => e.UserId, "ix_watchlist_userid");

            entity.HasIndex(e => new { e.UserId, e.StockSymbol, e.Exchange }, "uq_watchlist_user_symbol").IsUnique();

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.AddedAt)
                .HasDefaultValueSql("(getutcdate())")
                .HasColumnName("added_at");
            entity.Property(e => e.Exchange)
                .HasMaxLength(10)
                .HasDefaultValue("NSE")
                .HasColumnName("exchange");
            entity.Property(e => e.PriceAtAdd)
                .HasColumnType("decimal(12, 2)")
                .HasColumnName("price_at_add");
            entity.Property(e => e.StockName)
                .HasMaxLength(200)
                .HasColumnName("stock_name");
            entity.Property(e => e.StockSymbol)
                .HasMaxLength(50)
                .HasColumnName("stock_symbol");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.Watchlists)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("FK__watchlist__user___534D60F1");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
