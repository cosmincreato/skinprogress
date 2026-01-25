namespace SkinProgress.Services.Interfaces;
using SkinProgress.Models.DTOs;

public interface IAuthService
{
    Task<AuthResponseDto?> RegisterAsync(RegisterDto dto);
    Task<AuthResponseDto?> LoginAsync(LoginDto dto);
    Task<AuthResponseDto?> GoogleAuthAsync(string idToken);
    Task<UserDto?> GetMeAsync(string userId);
}