namespace SkinProgress.Models.Entities;

public class HabitDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;        // "Morning Cleansing", "Moisturizing", "SPF Application"
    public string Description { get; set; } = string.Empty;
    public bool IsDefault { get; set; } = false;            // system-defined vs user-defined
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
