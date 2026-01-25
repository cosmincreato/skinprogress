using Microsoft.AspNetCore.Authorization;
using SkinProgress.Services.Interfaces;

namespace SkinProgress.Controllers;

using Microsoft.AspNetCore.Mvc;
using Models.DTOs;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto dto)
    {
        var result = await _authService.RegisterAsync(dto);
        return result != null ? Ok(result) : BadRequest("Email or Username already in use.");
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto dto)
    {
        var result = await _authService.LoginAsync(dto);
        return result != null ? Ok(result) : Unauthorized("Invalid credentials.");
    }

    [HttpPost("google")]
    public async Task<IActionResult> GoogleAuth(GoogleAuthDto dto)
    {
        var result = await _authService.GoogleAuthAsync(dto.IdToken);
        if (result != null)
            return Ok(result);
        return BadRequest(new { message = "Invalid Google token or email already registered with password." });
    }
    
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMe()
    {
        // Extract ID from Token
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

        if (userId == null)
        {
            return Unauthorized("Invalid token.");
        }

        var user = await _authService.GetMeAsync(userId);

        if (user == null)
        {
            return NotFound("User not found.");
        }

        return Ok(user);
    }
}