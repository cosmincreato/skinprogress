namespace SkinProgress.Models.Entities;

public class GdprRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string RequestType { get; set; } = string.Empty; // "export", "deletion"
    public string Status { get; set; } = "pending";         // "pending", "processing", "completed", "cancelled"
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? DownloadUrl { get; set; }

    public User User { get; set; } = null!;
}
