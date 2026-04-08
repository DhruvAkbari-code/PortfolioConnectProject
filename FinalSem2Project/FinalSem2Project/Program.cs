using FinalSem2Project.Models;
using FinalSem2Project.Services;
using Microsoft.EntityFrameworkCore;

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

builder.Services.Configure<ZerodhaSettings>(
    builder.Configuration.GetSection("Zerodha"));

builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(opt =>
{
    opt.IdleTimeout = TimeSpan.FromHours(1);
    opt.Cookie.HttpOnly = true;
    opt.Cookie.IsEssential = true;
});


var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.UseAuthorization();


app.MapStaticAssets();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Dashboard}/{action=Index}/{id?}")
    .WithStaticAssets();


app.Run();
