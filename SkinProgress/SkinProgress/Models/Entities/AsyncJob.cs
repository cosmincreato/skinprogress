namespace SkinProgress.Models.Entities;

public class AsyncJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string JobType { get; set; } = string.Empty;     // "timelapse", "3d_reconstruction", "gdpr_export"
    public string Status { get; set; } = "queued";          // "queued", "processing", "completed", "failed"
    public string? ResultUrl { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }

    public User User { get; set; } = null!;
}
