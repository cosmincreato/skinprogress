namespace SkinProgress.Services.Interfaces;
using SkinProgress.Models.DTOs;

public interface IAuthService
{
    Task<AuthResponseDto?> RegisterAsync(RegisterDto dto);
    Task<AuthResponseDto?> LoginAsync(LoginDto dto);
}