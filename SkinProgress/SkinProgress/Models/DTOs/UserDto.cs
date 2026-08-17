namespace SkinProgress.Models.DTOs;

public record UserDto(
    Guid Id,
    string Email,
    string Username,
    string Role,
    string SkinType,
    string ProfilePictureUrl,
    DateTime CreatedAt,
    DateTime? LastSelfieAt,
    string? FirstName,
    string? LastName
);