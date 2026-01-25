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
}