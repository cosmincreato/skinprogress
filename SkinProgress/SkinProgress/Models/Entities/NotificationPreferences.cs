namespace SkinProgress.Models.Entities;

public class NotificationPreferences
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public bool PushEnabled { get; set; } = true;
    public bool InAppEnabled { get; set; } = true;
    public bool EmailEnabled { get; set; } = true;
    public TimeSpan PreferredReminderTime { get; set; } = new TimeSpan(9, 0, 0); // default 09:00
    public string? PushSubscriptionJson { get; set; }       // Web Push subscription object
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
