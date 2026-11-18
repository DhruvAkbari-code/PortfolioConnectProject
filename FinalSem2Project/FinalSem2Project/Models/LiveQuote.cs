// Models/LiveQuote.cs
namespace FinalSem2Project.Models
{
    public class LiveQuote
    {
        public decimal Price { get; set; }
        public decimal Change { get; set; }  // absolute
        public decimal PctChange { get; set; }  // percentage
    }
}