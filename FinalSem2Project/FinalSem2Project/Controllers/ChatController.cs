using FinalSem2Project.Filters;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;

namespace FinalSem2Project.Controllers
{
    [PremiumRequired]
    public class ChatController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<ChatController> _logger;

        public ChatController(IHttpClientFactory httpClientFactory, ILogger<ChatController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        // GET: /Chat/Index
        public IActionResult Index()
        {
            // Check if user is logged in
            if (HttpContext.Session.GetString("UserEmail") == null)
            {
                return RedirectToAction("Login", "Account");
            }

            // Initialize chat session in memory (not database)
            var sessionId = HttpContext.Session.Id;
            var chatHistory = GetChatHistory(sessionId);

            ViewBag.UserName = HttpContext.Session.GetString("UserFullName") ?? "User";
            ViewBag.UserInitials = GetInitials(HttpContext.Session.GetString("UserFullName") ?? "U");

            return View(chatHistory);
        }

        [HttpPost]
        public async Task<IActionResult> SendMessage([FromBody] ChatRequest request)
        {
            try
            {
                var sessionId = HttpContext.Session.Id;
                var question = request.Question?.Trim();

                if (string.IsNullOrEmpty(question))
                {
                    return Json(new { success = false, error = "Question is required" });
                }

                // Get chat history from session
                var chatHistory = GetChatHistory(sessionId);

                // Add user message to history
                chatHistory.Add(new ChatMessage
                {
                    Role = "user",
                    Content = question,
                    Timestamp = DateTime.Now
                });

                // Call Flask API
                var answer = await CallFlaskApi(question);

                // Add assistant response to history
                chatHistory.Add(new ChatMessage
                {
                    Role = "assistant",
                    Content = answer,
                    Timestamp = DateTime.Now
                });

                // Save updated history back to session
                SaveChatHistory(sessionId, chatHistory);

                return Json(new
                {
                    success = true,
                    answer = answer,
                    timestamp = DateTime.Now.ToString("HH:mm")
                });
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error in SendMessage: {ex.Message}");
                return Json(new { success = false, error = "Failed to get response from AI" });
            }
        }

        [HttpPost]
        public IActionResult ClearChat()
        {
            var sessionId = HttpContext.Session.Id;
            HttpContext.Session.Remove($"ChatHistory_{sessionId}");
            return Json(new { success = true });
        }

        private async Task<string> CallFlaskApi(string question)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                var flaskApiUrl = "http://localhost:5000/chat"; // Your Flask API URL

                var requestData = new { question = question };
                var json = JsonSerializer.Serialize(requestData);
                var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(flaskApiUrl, content);

                if (response.IsSuccessStatusCode)
                {
                    var jsonResponse = await response.Content.ReadAsStringAsync();
                    _logger.LogInformation($"Flask API Response: {jsonResponse}");

                    try
                    {
                        // Try to parse as FlaskResponse first
                        var result = JsonSerializer.Deserialize<FlaskResponse>(jsonResponse);
                        if (result != null && !string.IsNullOrEmpty(result.Answer))
                        {
                            return result.Answer;
                        }

                        // If that fails, try to parse as dynamic to handle different response formats
                        var dynamicResult = JsonSerializer.Deserialize<Dictionary<string, object>>(jsonResponse);
                        if (dynamicResult != null)
                        {
                            if (dynamicResult.ContainsKey("answer") && dynamicResult["answer"] != null)
                                return dynamicResult["answer"].ToString();
                            if (dynamicResult.ContainsKey("response") && dynamicResult["response"] != null)
                                return dynamicResult["response"].ToString();
                            if (dynamicResult.ContainsKey("message") && dynamicResult["message"] != null)
                                return dynamicResult["message"].ToString();
                        }

                        return "Sorry, I couldn't process your request.";
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogError($"JSON Deserialization error: {ex.Message}, Response: {jsonResponse}");
                        // If it's not JSON, return the raw response as is
                        if (!string.IsNullOrEmpty(jsonResponse))
                            return jsonResponse;

                        return "Sorry, I couldn't process your request.";
                    }
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError($"Flask API error (Status: {response.StatusCode}): {errorContent}");
                    return $"Unable to connect to AI service. Status: {response.StatusCode}";
                }
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError($"Flask API connection error: {ex.Message}");
                return "AI service is temporarily unavailable. Please make sure the Flask server is running on http://localhost:5000";
            }
            catch (Exception ex)
            {
                _logger.LogError($"Flask API error: {ex.Message}");
                return "AI service is temporarily unavailable. Please try again later.";
            }
        }

        private List<ChatMessage> GetChatHistory(string sessionId)
        {
            var key = $"ChatHistory_{sessionId}";
            var historyJson = HttpContext.Session.GetString(key);

            if (string.IsNullOrEmpty(historyJson))
            {
                // Return default welcome message
                return new List<ChatMessage>
                {
                    new ChatMessage
                    {
                        Role = "assistant",
                        Content = "👋 Hello! I'm your Stock Market AI Assistant. Ask me anything about Indian stocks, market trends, prices, or news!",
                        Timestamp = DateTime.Now
                    }
                };
            }

            return JsonSerializer.Deserialize<List<ChatMessage>>(historyJson) ?? new List<ChatMessage>();
        }

        private void SaveChatHistory(string sessionId, List<ChatMessage> history)
        {
            var key = $"ChatHistory_{sessionId}";
            var historyJson = JsonSerializer.Serialize(history);
            HttpContext.Session.SetString(key, historyJson);
        }

        private string GetInitials(string fullName)
        {
            if (string.IsNullOrEmpty(fullName)) return "U";
            var parts = fullName.Split(' ');
            if (parts.Length >= 2)
                return (parts[0][0].ToString() + parts[1][0].ToString()).ToUpper();
            return fullName[0].ToString().ToUpper();
        }
    }

    public class ChatRequest
    {
        public string? Question { get; set; } // Made nullable
    }

    public class ChatMessage
    {
        public string Role { get; set; } = string.Empty; // Initialized
        public string Content { get; set; } = string.Empty; // Initialized
        public DateTime Timestamp { get; set; }
    }

    public class FlaskResponse
    {
        public string? Answer { get; set; } // Made nullable
    }
}