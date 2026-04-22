using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SkinProgress.Models.Entities;

/// <summary>
/// AuditLog: Tracks authentication events for security compliance and debugging.
/// Stores login attempts, password changes, account deletions, GDPR requests.
/// Required for GDPR compliance and security incident investigation.
/// Performance: Indexed on UserId + Timestamp for efficient audit queries.
/// </summary>
[Table("AuditLogs")]
[Index(nameof(UserId))]
[Index(nameof(EventType))]
[Index(nameof(Timestamp))]
[Index(nameof(UserId), nameof(Timestamp))] // For user-specific audit trails
public class AuditLog
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    /// <summary>
    /// Event type: login, logout, password_change, password_reset, email_confirmed, 
    /// account_deleted, data_export_requested, oauth_login, rate_limited, email_change
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string EventType { get; set; } = string.Empty;

    /// <summary>
    /// Detailed description of event: "Successful login from Chrome browser", 
    /// "Failed login attempt (3/3 lockout)", "Password reset request sent to email"
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string EventDescription { get; set; } = string.Empty;

    /// <summary>
    /// IP address of requester (for security tracking and suspicious activity detection)
    /// </summary>
    [MaxLength(50)]
    public string? IpAddress { get; set; }

    /// <summary>
    /// User Agent string (browser, OS, device info)
    /// </summary>
    [MaxLength(500)]
    public string? UserAgent { get; set; }

    [Required]
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(UserId))]
    public virtual User? User { get; set; }
}
