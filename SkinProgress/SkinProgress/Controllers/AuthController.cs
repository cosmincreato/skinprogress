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
        return result != null ? Ok(result) : BadRequest("Email deja utilizat.");
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto dto)
    {
        var result = await _authService.LoginAsync(dto);
        return result != null ? Ok(result) : Unauthorized("Date incorecte.");
    }
    
    [HttpGet("me")]
    [Authorize]
    public IActionResult GetMe()
    {
        // Extrage ID-ul din Token
        var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Ok(new { Message = "Ești autorizat!", UserId = userId });
    }
}