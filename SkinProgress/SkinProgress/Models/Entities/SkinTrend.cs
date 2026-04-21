namespace SkinProgress.Models.Entities;

public class SkinTrend
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TrendType { get; set; } = string.Empty;   // "day_of_week", "zone_improvement", "zone_worsening"
    public string Zone { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty; // plain-language description
    public string? Metadata { get; set; }                   // JSON with statistical details
    public DateTime IdentifiedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }

    public User User { get; set; } = null!;
}
