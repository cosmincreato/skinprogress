namespace SkinProgress.Models.Entities;

public class UserMission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid MissionId { get; set; }
    public int CurrentProgress { get; set; } = 0;
    public string Status { get; set; } = "active";          // "active", "completed", "expired"
    public DateTime WeekStart { get; set; }                 // Monday 00:00 UTC
    public DateTime WeekEnd { get; set; }                   // Sunday 23:59 UTC
    public DateTime? CompletedAt { get; set; }

    public User User { get; set; } = null!;
    public Mission Mission { get; set; } = null!;
}
