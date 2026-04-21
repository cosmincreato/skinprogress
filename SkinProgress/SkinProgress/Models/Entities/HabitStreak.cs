namespace SkinProgress.Models.Entities;

public class HabitStreak
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid HabitDefinitionId { get; set; }
    public int CurrentStreak { get; set; } = 0;
    public int LongestStreak { get; set; } = 0;
    public DateTime? LastCompletedDate { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
