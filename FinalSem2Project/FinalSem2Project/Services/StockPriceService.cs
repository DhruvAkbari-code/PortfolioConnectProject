using System.Net;
using System.Text.Json;
using FinalSem2Project.Models;

namespace FinalSem2Project.Services
{
    public class StockPriceService : IDisposable
    {
        private readonly HttpClient _http;
        private readonly CookieContainer _cookies;
        private bool _seeded = false;
        private readonly SemaphoreSlim _seedLock = new(1, 1);

        public StockPriceService()
        {
            _cookies = new CookieContainer();

            var handler = new HttpClientHandler
            {
                CookieContainer = _cookies,
                UseCookies = true,
                AllowAutoRedirect = true,
                // ✅ Add Brotli:
                AutomaticDecompression = DecompressionMethods.GZip
                       | DecompressionMethods.Deflate
                       | DecompressionMethods.Brotli
            };

            _http = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(15)
            };

            _http.DefaultRequestHeaders.Clear();
            _http.DefaultRequestHeaders.TryAddWithoutValidation("User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Accept",
                "application/json, text/plain, */*");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Language",
                "en-US,en;q=0.9");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Encoding",
                "gzip, deflate, br");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Connection", "keep-alive");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("sec-ch-ua",
                "\"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\", \"Not-A.Brand\";v=\"99\"");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("sec-ch-ua-mobile", "?0");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("sec-ch-ua-platform", "\"Windows\"");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Sec-Fetch-Dest", "empty");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Sec-Fetch-Mode", "cors");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Sec-Fetch-Site", "same-origin");
            _http.DefaultRequestHeaders.TryAddWithoutValidation("Referer",
                "https://www.nseindia.com/market-data/live-equity-market");
        }

        // Seeds the session once — subsequent calls reuse the cookie jar
        private async Task EnsureSeededAsync()
        {
            if (_seeded) return;

            await _seedLock.WaitAsync();
            try
            {
                if (_seeded) return;

                var r1 = await _http.GetAsync("https://www.nseindia.com/");
                Console.WriteLine($"=== SEED 1: {r1.StatusCode} ===");
                await Task.Delay(400);

                var r2 = await _http.GetAsync("https://www.nseindia.com/market-data/live-equity-market");
                Console.WriteLine($"=== SEED 2: {r2.StatusCode} ===");
                await Task.Delay(300);

                // Print all cookies received
                var cookies = _cookies.GetAllCookies();
                Console.WriteLine($"=== COOKIES ({cookies.Count}) ===");
                foreach (Cookie c in cookies)
                    Console.WriteLine($"  {c.Name} = {c.Value.Substring(0, Math.Min(40, c.Value.Length))}");

                _seeded = true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"=== SEED ERROR: {ex.Message} ===");
            }
            finally
            {
                _seedLock.Release();
            }
        }

        // Re-seeds and retries once on failure
        private async Task<string?> GetJsonAsync(string url)
        {
            await EnsureSeededAsync();

            try
            {
                var response = await _http.GetAsync(url);
        var content = await response.Content.ReadAsStringAsync();

        // Log everything to console
        Console.WriteLine($"=== NSE DEBUG ===");
                Console.WriteLine($"URL: {url}");
                Console.WriteLine($"Status: {response.StatusCode}");
                Console.WriteLine($"Content length: {content.Length}");
                Console.WriteLine($"Content preview: {content.Substring(0, Math.Min(300, content.Length))}");
                Console.WriteLine($"=================");

                if (!response.IsSuccessStatusCode) return null;
                return content;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"=== NSE ERROR ===");
                Console.WriteLine($"URL: {url}");
                Console.WriteLine($"Exception: {ex.GetType().Name}: {ex.Message}");
                Console.WriteLine($"=================");

                _seeded = false;
                await EnsureSeededAsync();
                try
                {
                    var retry = await _http.GetAsync(url);
    var content = await retry.Content.ReadAsStringAsync();
    Console.WriteLine($"=== NSE RETRY ===");
                    Console.WriteLine($"Status: {retry.StatusCode}");
                    Console.WriteLine($"Content preview: {content.Substring(0, Math.Min(300, content.Length))}");
                    Console.WriteLine($"=================");
                    return retry.IsSuccessStatusCode? content : null;
                }
                catch { return null; }
            }
        }

        private async Task<string?> GetRawAsync(string url)
        {
            await EnsureSeededAsync();

            try
            {
                // Use HttpRequestMessage with a pre-built Uri to prevent any re-encoding
                var request = new HttpRequestMessage(HttpMethod.Get,
                    new Uri(url, UriKind.Absolute));
                var response = await _http.SendAsync(request);
                var content = await response.Content.ReadAsStringAsync();

                Console.WriteLine($"=== NSE DEBUG ===");
                Console.WriteLine($"URL: {url}");
                Console.WriteLine($"Status: {response.StatusCode}");
                Console.WriteLine($"Content preview: {content[..Math.Min(200, content.Length)]}");
                Console.WriteLine($"=================");

                return response.IsSuccessStatusCode ? content : null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"=== NSE ERROR: {ex.Message} ===");
                return null;
            }
        }

        public async Task<LiveQuote?> GetLiveQuoteAsync(string symbol)
        {
            try
            {
                var url = $"https://query1.finance.yahoo.com/v8/finance/chart/{Uri.EscapeDataString(symbol)}.NS";
                var json = await _http.GetStringAsync(url);

                var doc = JsonDocument.Parse(json);
                var meta = doc.RootElement
                    .GetProperty("chart")
                    .GetProperty("result")[0]
                    .GetProperty("meta");

                var price = meta.GetProperty("regularMarketPrice").GetDecimal();
                var prevClose = meta.GetProperty("chartPreviousClose").GetDecimal();
                var change = price - prevClose;
                var pct = prevClose != 0 ? Math.Round(change / prevClose * 100, 2) : 0;

                return new LiveQuote { Price = price, Change = change, PctChange = pct };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"=== YAHOO ERROR ({symbol}): {ex.Message} ===");
                return null;
            }
        }

        // Keep this for backward compatibility wherever GetLivePriceAsync is still called
        public async Task<decimal?> GetLivePriceAsync(string symbol)
        {
            var q = await GetLiveQuoteAsync(symbol);
            return q?.Price;
        }

        public async Task<List<TrendingStock>> GetTrendingStocksAsync()
        {
            var result = await TryLiveAsync("gainers");
            if (result != null) return result;

            result = await TryLiveAsync("loosers");
            if (result != null) return result;

            result = await TryEodAsync();
            if (result != null) return result;

            return new List<TrendingStock>();
        }

        private async Task<List<TrendingStock>?> TryLiveAsync(string index)
        {
            var json = await GetJsonAsync(
                $"https://www.nseindia.com/api/live-analysis-variations?index={index}");

            if (json == null) return null;

            try
            {
                var doc = JsonDocument.Parse(json);
                var data = doc.RootElement.GetProperty("NIFTY").GetProperty("data");

                // 👇 Add this to see the actual first item's fields
                var first = data.EnumerateArray().FirstOrDefault();
                Console.WriteLine($"=== FIRST ITEM: {first} ===");

                var result = ParseStocks(data);
                Console.WriteLine($"=== PARSED COUNT: {result.Count} ===");
                return result.Count > 0 ? result : null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"=== PARSE ERROR: {ex.Message} ===");
                return null;
            }
        }

        private async Task<List<TrendingStock>?> TryEodAsync()
        {
            var json = await GetRawAsync(
                "https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050");

            if (json == null) return null;

            try
            {
                var doc = JsonDocument.Parse(json);
                var data = doc.RootElement.GetProperty("data");
                var result = new List<TrendingStock>();

                foreach (var item in data.EnumerateArray())
                {
                    if (!item.TryGetProperty("symbol", out var symProp)) continue;
                    var sym = symProp.GetString() ?? "";
                    if (sym == "NIFTY 50") continue;

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
                        IsEod = true
                    });
                }

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
                if (!item.TryGetProperty("ltp", out var priceProp)) continue; // was lastPrice
                if (!item.TryGetProperty("net_price", out var chgProp)) continue; // was change
                if (!item.TryGetProperty("perChange", out var pctProp)) continue; // was pChange

                result.Add(new TrendingStock
                {
                    Symbol = symProp.GetString() ?? "",
                    Name = "",   // not present in this endpoint — will be empty
                    LastPrice = priceProp.GetDecimal(),
                    DayChange = chgProp.GetDecimal(),
                    PctChange = pctProp.GetDecimal(),
                    Volume = item.TryGetProperty("trade_quantity", out var vol) // was totalTradedVolume
                                ? vol.GetInt64() : 0,
                    IsEod = false
                });
            }
            return result;
        }
        public void Dispose()
        {
            _http.Dispose();
            _seedLock.Dispose();
        }
        public void InvalidateSession()
        {
            _seeded = false;
        }
    }
}