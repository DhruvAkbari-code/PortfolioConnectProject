using FinalSem2Project.Models;
using FinalSem2Project.Services;
using Microsoft.EntityFrameworkCore;
using FinalSem2Project.Middleware;


var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews();


builder.Services.AddDbContext<StockMarketDbContext>(opt => opt.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IKiteService, KiteServices>();

// Remove these two lines:
// builder.Services.AddHttpClient<StockPriceService>();
// builder.Services.AddScoped<StockPriceService>();

// Replace with this single block:
builder.Services.AddHttpClient<StockPriceService>()
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        UseCookies = true,
        CookieContainer = new System.Net.CookieContainer(),
        AutomaticDecompression = System.Net.DecompressionMethods.GZip
                               | System.Net.DecompressionMethods.Deflate
                               | System.Net.DecompressionMethods.Brotli
    });

//builder.Services.Configure<ZerodhaSettings>(
    //builder.Configuration.GetSection("Zerodha"));

builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(opt =>
{
    opt.IdleTimeout = TimeSpan.FromHours(1);
    opt.Cookie.HttpOnly = true;
    opt.Cookie.IsEssential = true;
});

// ── Google OAuth ──────────────────────────────────────────────
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = "Cookies";
    options.DefaultChallengeScheme = "Google";
})
.AddCookie("Cookies")
.AddGoogle("Google", options =>
{
    options.ClientId = builder.Configuration["Google:ClientId"]!;
    options.ClientSecret = builder.Configuration["Google:ClientSecret"]!;
    options.CallbackPath = "/signin-google";   // must match Google Console
    options.SaveTokens = true;
});
// ─────────────────────────────────────────────────────────────




var app = builder.Build();

app.MapControllerRoute(
    name: "stock",
    pattern: "Stock/{symbol}",
    defaults: new { controller = "Stock", action = "Index" });

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.UseMiddleware<SubscriptionExpiryMiddleware>();
app.UseAuthorization();


app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Trending}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
