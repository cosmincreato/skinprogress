using System.ComponentModel.DataAnnotations;

namespace SkinProgress.Models.DTOs;

public record GoogleAuthDto(
    [Required(ErrorMessage = "ID token is required")]
    string IdToken
);
