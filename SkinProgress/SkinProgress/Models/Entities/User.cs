using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace SkinProgress.Models.Entities;

[Index(nameof(Email), IsUnique = true)]
[Index(nameof(Username), IsUnique = true)]
public class User
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [EmailAddress]
    [MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string Username { get; set; } = string.Empty;

    public string? PasswordHash { get; set; }

    /// Password salt for PBKDF2/BCrypt operations
    public string? PasswordSalt { get; set; }

    /// Email confirmation status
    public bool EmailConfirmed { get; set; } = false;

    public DateTime? EmailConfirmedAt { get; set; }

    /// Last successful login timestamp
    public DateTime? LastLoginAt { get; set; }

    /// Failed login attempt tracking for rate limiting
    public int LoginAttempts { get; set; } = 0;

    /// Account lockout until timestamp (for rate limiting: 3 attempts = 15 min lockout)
    public DateTime? LoginLockoutUntil { get; set; }

    [Required]
    [MaxLength(20)]
    public string Role { get; set; } = UserRoles.User;

    /// Local, Google, Apple
    [MaxLength(50)]
    public string Provider { get; set; } = "Local";

    [MaxLength(255)]
    public string? ExternalId { get; set; }

    /// Profile Info
    [MaxLength(50)]
    public string SkinType { get; set; } = "Not Set";

    [MaxLength(255)]
    public string ProfilePictureUrl { get; set; } = "/uploads/default.png";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? LastSelfieAt { get; set; }

    /// <summary>
    /// Standard storage quota in bytes for photo uploads.
    /// Default: 5GB (5,368,709,120 bytes).
    /// Premium/Pro tiers may have higher allocations.
    /// </summary>
    public long StandardStorageQuota { get; set; } = 5_368_709_120; // 5GB in bytes

    /// <summary>
    /// Current storage used in bytes for photo uploads.
    /// Incremented on upload, decremented on deletion.
    /// Must be kept in sync with actual file storage.
    /// </summary>
    public long CurrentStorageUsed { get; set; } = 0;

    // --- GDPR / deletion fields ---
    public bool IsMarkedForDeletion { get; set; } = false;
    public DateTime? DeletionRequestedAt { get; set; }

    // --- Apple OAuth ---
    [MaxLength(255)]
    public string? AppleId { get; set; }

    // Navigation properties
    /// <summary>
    /// Collection of photos captured by this user.
    /// </summary>
    public ICollection<Photo>? Photos { get; set; } = new List<Photo>();

    /// <summary>
    /// Collection of selfie capture sessions for this user.
    /// </summary>
    public ICollection<SelfieCapture>? SelfieCaptures { get; set; } = new List<SelfieCapture>();
}