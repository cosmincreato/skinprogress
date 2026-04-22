using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace SkinProgress.Models.Entities;

/// <summary>
/// User preferences for personalized recommendations and analysis.
/// Stores skin type, known sensitivities, and current products in use.
/// Used by recommendation system and analysis engine.
/// </summary>
[Table("UserPreferences")]
[Index(nameof(UserId), IsUnique = true)]
public class UserPreferences
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    /// <summary>
    /// Skin type: Oily, Dry, Combination, Sensitive
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string SkinType { get; set; } = "Not Set";

    /// <summary>
    /// Comma-separated list of sensitivities: fragrance, alcohol, dyes, parabens, sulfates
    /// Stored as JSON array string: ["fragrance", "alcohol"] - parsed by application layer
    /// </summary>
    public string? Sensitivities { get; set; } // JSON array: ["fragrance", "alcohol"]

    /// <summary>
    /// Comma-separated list of products user is currently using
    /// Stored as JSON array string for compatibility checking
    /// </summary>
    public string? ProductsUsed { get; set; } // JSON array: ["CeraVe Cleanser", "The Ordinary Retinol"]

    [Required]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Required]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // --- Product filter preferences ---
    public bool FilterVegan { get; set; } = false;
    public bool FilterCrueltyFree { get; set; } = false;
    public bool FilterFragranceFree { get; set; } = false;
    public bool FilterAlcoholFree { get; set; } = false;

    /// <summary>Preferred notification time (e.g. 09:00). Null means use system default.</summary>
    public TimeSpan? NotificationTime { get; set; }

    // Foreign key relationship
    [ForeignKey(nameof(UserId))]
    public virtual User? User { get; set; }
}
