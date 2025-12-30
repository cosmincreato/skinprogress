using System.ComponentModel.DataAnnotations;

namespace SkinProgress.Models.Entities;

public class User
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();
    
    public string Email { get; set; } = string.Empty;
    
    public string Username { get; set; } = string.Empty;
    
    public string? PasswordHash { get; set; }
    
    /// Local, Google, Apple
    public string Provider { get; set; } = "Local"; 
    
    public string? ExternalId { get; set; } 

    /// Profile Info
    public string SkinType { get; set; } = "Not Set";
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}