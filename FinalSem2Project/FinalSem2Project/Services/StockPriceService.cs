using System.Text.Json;
using FinalSem2Project.Models;

namespace FinalSem2Project.Services
{
    public class StockPriceService
    {
        private readonly HttpClient _http;

        public StockPriceService(HttpClient http)
        {
            http.DefaultRequestHeaders.Clear();
            http.DefaultRequestHeaders.Add("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36");
            http.DefaultRequestHeaders.Add("Accept", "application/json, text/plain, */*");
            http.DefaultRequestHeaders.Add("Accept-Language", "en-US,en;q=0.9");
            http.DefaultRequestHeaders.Referrer =
                new Uri("https://www.nseindia.com/market-data/live-equity-market");
            _http = http;
        }

        public async Task<decimal?> GetLivePriceAsync(string symbol)
        {
            try
            {
                await _http.GetAsync("https://www.nseindia.com");
                var json = await _http.GetStringAsync(
                    $"https://www.nseindia.com/api/quote-equity?symbol={Uri.EscapeDataString(symbol)}");
                var doc = JsonDocument.Parse(json);
                return doc.RootElement.GetProperty("priceInfo").GetProperty("lastPrice").GetDecimal();
            }
            catch { return null; }
        }

        public async Task<List<TrendingStock>> GetTrendingStocksAsync()
        {
            await _http.GetAsync("https://www.nseindia.com"); // seed cookies once

            // 1. live gainers (market open)
            var result = await TryLiveAsync("gainers");
            if (result != null) return result;

            // 2. live losers
            result = await TryLiveAsync("loosers");
            if (result != null) return result;

            // 3. Market closed — fall back to last session's Nifty 50 EOD data
            result = await TryEodAsync();
            if (result != null) return result;

            return new List<TrendingStock>();
        }

        // Tries the live-analysis-variations endpoint (works during market hours)
        private async Task<List<TrendingStock>?> TryLiveAsync(string index)
        {
            try
            {
                var json = await _http.GetStringAsync(
                    $"https://www.nseindia.com/api/live-analysis-variations?index={index}");

                var doc = JsonDocument.Parse(json);
                var data = doc.RootElement.GetProperty("NIFTY").GetProperty("data");
                var result = ParseStocks(data);
                return result.Count > 0 ? result : null;
            }
            catch { return null; }
        }

        // Falls back to Nifty 50 quote which always has last closing data
        private async Task<List<TrendingStock>?> TryEodAsync()
        {
            try
            {
                // This endpoint returns all Nifty 50 stocks with previous close data
                // Works 24/7 — not restricted to market hours
                var json = await _http.GetStringAsync(
                    "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050");

                var doc = JsonDocument.Parse(json);
                var data = doc.RootElement.GetProperty("data");

                var result = new List<TrendingStock>();

                foreach (var item in data.EnumerateArray())
                {
                    if (!item.TryGetProperty("symbol", out var symProp)) continue;

                    var sym = symProp.GetString() ?? "";
                    if (sym == "NIFTY 50") continue; // skip the index row itself

                    if (!item.TryGetProperty("lastPrice", out var priceProp)) continue;
                    if (!item.TryGetProperty("change", out var changeProp)) continue;
                    if (!item.TryGetProperty("pChange", out var pctProp)) continue;

                    result.Add(new TrendingStock
                    {
                        Symbol = sym,
                        Name = item.TryGetProperty("meta", out var meta) &&
                                    meta.TryGetProperty("companyName", out var n)
                                    ? n.GetString() ?? sym : sym,
                        LastPrice = priceProp.GetDecimal(),
                        DayChange = changeProp.GetDecimal(),
                        PctChange = pctProp.GetDecimal(),
                        Volume = item.TryGetProperty("totalTradedVolume", out var vol)
                                    ? vol.GetInt64() : 0,
                        IsEod = true   // flag so View can show "Last session" label
                    });
                }

                // Sort by absolute % change so most interesting stocks show first
                result = result.OrderByDescending(s => Math.Abs(s.PctChange)).ToList();
                return result.Count > 0 ? result : null;
            }
            catch { return null; }
        }

        private List<TrendingStock> ParseStocks(JsonElement data)
        {
            var result = new List<TrendingStock>();
            foreach (var item in data.EnumerateArray())
            {
                if (!item.TryGetProperty("symbol", out var symProp)) continue;
                if (!item.TryGetProperty("lastPrice", out var priceProp)) continue;
                if (!item.TryGetProperty("change", out var chgProp)) continue;
                if (!item.TryGetProperty("pChange", out var pctProp)) continue;

                var name = "";
                if (item.TryGetProperty("meta", out var meta) &&
                    meta.TryGetProperty("companyName", out var n))
                    name = n.GetString() ?? "";

                result.Add(new TrendingStock
                {
                    Symbol = symProp.GetString() ?? "",
                    Name = name,
                    LastPrice = priceProp.GetDecimal(),
                    DayChange = chgProp.GetDecimal(),
                    PctChange = pctProp.GetDecimal(),
                    Volume = item.TryGetProperty("totalTradedVolume", out var vol)
                                ? vol.GetInt64() : 0,
                    IsEod = false
                });
            }
            return result;
        }
    }
}