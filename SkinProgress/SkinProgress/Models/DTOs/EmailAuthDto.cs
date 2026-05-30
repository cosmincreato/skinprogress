using System.ComponentModel.DataAnnotations;

namespace SkinProgress.Models.DTOs;

/// <summary>
/// Request DTO for email-based user registration.
/// </summary>
public record EmailRegistrationRequestDto(
    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    string Email,

    [Required(ErrorMessage = "Password is required")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters long")]
    string Password,

    [Required(ErrorMessage = "Password confirmation is required")]
    string ConfirmPassword
);

/// <summary>
/// Response DTO for successful authentication.
/// Includes access token (15m), refresh token (7d), and user info.
/// </summary>
public record AuthTokenResponseDto(
    string AccessToken,
    string RefreshToken,
    UserInfoDto User
);

/// <summary>
/// User information included in auth response.
/// </summary>
public record UserInfoDto(
    Guid Id,
    string Email,
    string[] Roles
);

/// <summary>
/// Request DTO for email confirmation.
/// </summary>
public record ConfirmEmailRequestDto(
    [Required(ErrorMessage = "Confirmation token is required")]
    string Token
);

/// <summary>
/// Request DTO for resending confirmation email.
/// </summary>
public record ResendConfirmationRequestDto(
    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    string Email
);

/// <summary>
/// Request DTO for password reset token generation.
/// </summary>
public record PasswordResetRequestDto(
    [Required(ErrorMessage = "Email is required")]
    [EmailAddress(ErrorMessage = "Invalid email format")]
    string Email
);

/// <summary>
/// Request DTO for password reset.
/// </summary>
public record ResetPasswordRequestDto(
    [Required(ErrorMessage = "Password reset token is required")]
    string Token,

    [Required(ErrorMessage = "New password is required")]
    [MinLength(8, ErrorMessage = "Password must be at least 8 characters long")]
    string NewPassword,

    [Required(ErrorMessage = "Password confirmation is required")]
    string ConfirmPassword
);
