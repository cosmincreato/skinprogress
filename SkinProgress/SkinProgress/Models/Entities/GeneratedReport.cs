namespace SkinProgress.Models.Entities;

public class GeneratedReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string ReportType { get; set; } = string.Empty;  // "weekly", "monthly"
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public string Content { get; set; } = string.Empty;     // AI-generated text
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }                 // GeneratedAt + 12 months

    public User User { get; set; } = null!;
}
