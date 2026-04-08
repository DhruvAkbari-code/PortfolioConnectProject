namespace FinalSem2Project.Models
{
    public class TrendingStock
    {
        public string Symbol { get; set; } = "";
        public string Name { get; set; } = "";
        public decimal LastPrice { get; set; }
        public decimal DayChange { get; set; }
        public decimal PctChange { get; set; }
        public long Volume { get; set; }
        public bool IsEod { get; set; }
    }
}