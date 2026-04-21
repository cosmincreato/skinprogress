using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SkinProgress.Models.Entities;

/// <summary>
/// AuthToken: Tracks JWT tokens for revocation and session management.
/// Used to invalidate tokens before natural expiration (logout, password change, etc).
/// Performance: Indexed on UserId for quick user token lookups.
/// </summary>
[Table("AuthTokens")]
[Index(nameof(UserId))]
[Index(nameof(TokenHash), IsUnique = true)]
[Index(nameof(ExpiresAt))]
public class AuthToken
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    /// <summary>
    /// Hash of JWT token (never store plaintext tokens)
    /// Used to verify token revocation without exposing token content
    /// </summary>
    [Required]
    [MaxLength(512)]
    public string TokenHash { get; set; } = string.Empty;

    /// <summary>
    /// Token expiration time (when token naturally expires)
    /// </summary>
    [Required]
    public DateTime ExpiresAt { get; set; }

    /// <summary>
    /// When token was revoked (null = not revoked, token is valid if not expired)
    /// </summary>
    public DateTime? RevokedAt { get; set; }

    /// <summary>
    /// Reason for revocation: logout, password_change, admin_revoke, device_logout, etc
    /// </summary>
    [MaxLength(100)]
    public string? RevokedReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(UserId))]
    public virtual User? User { get; set; }

    public bool IsValid => RevokedAt == null && ExpiresAt > DateTime.UtcNow;
}
