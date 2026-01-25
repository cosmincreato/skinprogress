using System.ComponentModel.DataAnnotations;

namespace SkinProgress.Models.DTOs;

public record LoginDto(
    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    string Email,
    
    [Required(ErrorMessage = "Password is required")]
    string Password
);