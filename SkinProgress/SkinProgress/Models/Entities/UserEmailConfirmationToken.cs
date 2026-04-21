using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SkinProgress.Models.Entities;

/// <summary>
/// Email confirmation tokens for new account verification.
/// Tokens expire after 48 hours.
/// Deleted after email is confirmed.
/// </summary>
[Table("UserEmailConfirmationTokens")]
[Index(nameof(Token), IsUnique = true)]
[Index(nameof(ExpiresAt))]
public class UserEmailConfirmationToken
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    [Required]
    [MaxLength(255)]
    public string Token { get; set; } = string.Empty;

    [Required]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Required]
    public DateTime ExpiresAt { get; set; }

    [ForeignKey(nameof(UserId))]
    public virtual User? User { get; set; }

    public bool IsValid => DateTime.UtcNow <= ExpiresAt;
}
