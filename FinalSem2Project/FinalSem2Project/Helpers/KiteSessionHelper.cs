using System.Text.Json;

namespace FinalSem2Project.Helpers
{
    public static class KiteSessionHelper
    {
        private const string TokensKey = "KiteTokens";

        public static Dictionary<int, string> GetTokens(ISession session)
        {
            var json = session.GetString(TokensKey);
            if (string.IsNullOrEmpty(json)) return new();
            return JsonSerializer.Deserialize<Dictionary<int, string>>(json) ?? new();
        }

        public static void SetToken(ISession session, int accountId, string token)
        {
            var tokens = GetTokens(session);
            tokens[accountId] = token;
            session.SetString(TokensKey, JsonSerializer.Serialize(tokens));
        }

        public static void RemoveToken(ISession session, int accountId)
        {
            var tokens = GetTokens(session);
            tokens.Remove(accountId);
            session.SetString(TokensKey, JsonSerializer.Serialize(tokens));
        }

        public static bool IsConnected(ISession session, int accountId)
            => GetTokens(session).ContainsKey(accountId);
    }
}