namespace SkinProgress.Models.Entities;

public class Mission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Type { get; set; } = string.Empty;        // "photo_capture", "habit"
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int TargetCount { get; set; }
    public Guid? RewardBadgeId { get; set; }

    public Badge? RewardBadge { get; set; }
}
