using System.ComponentModel.DataAnnotations;

namespace SkinProgress.Models.DTOs;

public record UpdateUserDto(
    [EmailAddress(ErrorMessage = "Invalid email format")]
    string? Email,
    
    [MinLength(3, ErrorMessage = "Username must be at least 3 characters long")]
    string? Username,
    
    [MaxLength(50)]
    string? SkinType
);