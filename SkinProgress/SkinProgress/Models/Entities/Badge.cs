namespace SkinProgress.Models.Entities;

public class Badge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = string.Empty;        // "STREAK_7", "STREAK_30", "STREAK_90", "PROGRESS_20"
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string IconUrl { get; set; } = string.Empty;
}
