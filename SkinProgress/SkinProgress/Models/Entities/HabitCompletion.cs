namespace SkinProgress.Models.Entities;

public class HabitCompletion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid HabitDefinitionId { get; set; }
    public DateTime CompletedAt { get; set; }  // UTC timestamp
    public DateTime Date { get; set; }          // UTC date (for daily grouping)

    public User User { get; set; } = null!;
    public HabitDefinition HabitDefinition { get; set; } = null!;
}
