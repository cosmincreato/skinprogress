using Microsoft.AspNetCore.Authorization;
using SkinProgress.Services.Interfaces;
using SkinProgress.Services;
using SkinProgress.Models.DTOs;

namespace SkinProgress.Controllers;

using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IRegistrationService _registrationService;
    private readonly IEmailConfirmationService _emailConfirmationService;
    private readonly ILoginService _loginService;
    private readonly IEmailService _emailService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService,
        IRegistrationService registrationService,
        IEmailConfirmationService emailConfirmationService,
        ILoginService loginService,
        IEmailService emailService,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _registrationService = registrationService;
        _emailConfirmationService = emailConfirmationService;
        _loginService = loginService;
        _emailService = emailService;
        _logger = logger;
    }

    // ==================== Legacy endpoints (IAuthService) ====================
    // These endpoints use the existing IAuthService for backward compatibility

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto dto)
    {
        var result = await _authService.RegisterAsync(dto);
        return result != null
            ? Ok(result)
            : BadRequest(new { message = "Email or Username already in use." });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto dto)
    {
        var result = await _authService.LoginAsync(dto);
        return result != null
            ? Ok(result)
            : Unauthorized(new { message = "Invalid credentials." });
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

    // ==================== New email-based authentication endpoints ====================
    // These endpoints implement the new email registration + confirmation flow

    /// <summary>
    /// Register new user with email and password.
    /// Sends confirmation email that must be verified before login.
    /// </summary>
    /// <param name="request">Email and password</param>
    /// <returns>Confirmation email sent message</returns>
    [HttpPost("email/register")]
    public async Task<IActionResult> EmailRegister([FromBody] EmailRegistrationRequestDto request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            // Register user
            var (user, confirmationToken) = await _registrationService.RegisterUserAsync(
                request.Email,
                request.Password,
                request.ConfirmPassword);

            // Send confirmation email
            try
            {
                await _emailService.SendConfirmationEmailAsync(user.Email!, confirmationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to send confirmation email to {user.Email}: {ex.Message}");
                // Don't fail the registration if email send fails - user can request resend
            }

            return Ok(new
            {
                message = "Registration successful. Please check your email to confirm your address.",
                email = user.Email,
                userId = user.Id
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Registration error: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred during registration." });
        }
    }

    /// <summary>
    /// Confirm user email address using token from confirmation email.
    /// Must be called before user can login.
    /// </summary>
    /// <param name="request">Confirmation token</param>
    /// <returns>Email confirmed message</returns>
    [HttpPost("email/confirm")]
    public async Task<IActionResult> ConfirmEmail([FromBody] ConfirmEmailRequestDto request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            await _emailConfirmationService.ConfirmEmailAsync(request.Token);

            return Ok(new { message = "Email confirmed successfully. You can now login." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Email confirmation error: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred confirming email." });
        }
    }

    /// <summary>
    /// Login user with email and password.
    /// Returns JWT access token (15 min) and refresh token (7 days).
    /// Requires email to be confirmed.
    /// </summary>
    /// <param name="request">Email and password</param>
    /// <returns>JWT tokens and user info</returns>
    [HttpPost("email/login")]
    public async Task<IActionResult> EmailLogin([FromBody] LoginDto request)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var (user, accessToken, refreshToken) = await _loginService.LoginAsync(
                request.Email,
                request.Password);

            var roles = user.Role != null ? new[] { user.Role } : Array.Empty<string>();

            var response = new AuthTokenResponseDto(
                AccessToken: accessToken,
                RefreshToken: refreshToken,
                User: new UserInfoDto(
                    Id: user.Id,
                    Email: user.Email!,
                    Roles: roles
                )
            );

            return Ok(response);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError($"Login error: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred during login." });
        }
    }
}