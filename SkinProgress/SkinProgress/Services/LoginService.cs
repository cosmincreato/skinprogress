using Microsoft.EntityFrameworkCore;
using SkinProgress.Constants;
using SkinProgress.Data;
using SkinProgress.Models.Entities;

namespace SkinProgress.Services;

/// <summary>
/// Login service for authenticating users with email and password.
/// Validates credentials, enforces email confirmation, applies rate limiting,
/// generates JWT tokens, and logs audit events.
/// </summary>
public interface ILoginService
{
    /// <summary>
    /// Authenticate user with email and password.
    /// Throws InvalidOperationException if credentials invalid, email not confirmed, or account locked.
    /// Returns User and JWT token pair on success.
    /// </summary>
    Task<(User User, string AccessToken, string RefreshToken)> LoginAsync(string email, string password);
}

public class LoginService : ILoginService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHashingService _passwordHashingService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IRateLimitService _rateLimitService;
    private readonly ILogger<LoginService> _logger;

    public LoginService(
        AppDbContext dbContext,
        IPasswordHashingService passwordHashingService,
        IJwtTokenService jwtTokenService,
        IRateLimitService rateLimitService,
        ILogger<LoginService> logger)
    {
        _dbContext = dbContext;
        _passwordHashingService = passwordHashingService;
        _jwtTokenService = jwtTokenService;
        _rateLimitService = rateLimitService;
        _logger = logger;
    }

    /// <summary>
    /// Authenticate user and return JWT token pair.
    /// 
    /// Validation sequence:
    /// 1. Check email format
    /// 2. Find user by email
    /// 3. Check if account is rate-limited (locked out)
    /// 4. Verify password hash
    /// 5. Verify email is confirmed
    /// 6. Generate JWT tokens
    /// 7. Reset rate limit counter
    /// 8. Log audit event
    /// 9. Update last login time
    /// 
    /// Throws InvalidOperationException with specific message for each failure case.
    /// </summary>
    public async Task<(User User, string AccessToken, string RefreshToken)> LoginAsync(string email, string password)
    {
        // Validate inputs
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new InvalidOperationException("Email is required");
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Password is required");
        }

        // Find user by email
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Email == email);

        if (user == null)
        {
            _logger.LogWarning($"Login attempt for non-existent email: {email}");
            throw new InvalidOperationException("Invalid email or password");
        }

        // Check if account is locked due to rate limiting
        if (_rateLimitService.IsLockedOut(user.Id))
        {
            _logger.LogWarning($"Login attempt for rate-limited user: {user.Id}");
            throw new InvalidOperationException("Account is temporarily locked. Please try again later.");
        }

        // Verify password
        // PasswordHash and PasswordSalt are required for local authentication
        if (string.IsNullOrEmpty(user.PasswordHash) || string.IsNullOrEmpty(user.PasswordSalt))
        {
            _logger.LogWarning($"Login attempt for user without password hash: {user.Id}");
            throw new InvalidOperationException("Invalid email or password");
        }

        bool passwordValid = _passwordHashingService.VerifyPassword(
            password,
            user.PasswordHash,
            user.PasswordSalt);

        if (!passwordValid)
        {
            // Increment failed attempts
            _rateLimitService.IncrementFailedAttempt(user.Id);
            _logger.LogWarning($"Failed login attempt for user: {user.Id}");
            throw new InvalidOperationException("Invalid email or password");
        }

        // Verify email is confirmed
        if (!user.EmailConfirmed)
        {
            _logger.LogWarning($"Login attempt for unconfirmed email: {user.Id}");
            throw new InvalidOperationException("Email address not confirmed. Please check your email.");
        }

        // Generate JWT tokens
        string accessToken = _jwtTokenService.GenerateAccessToken(user.Id, user.Email!);
        string refreshToken = _jwtTokenService.GenerateRefreshToken();

        // Reset rate limit counter (successful login)
        _rateLimitService.ResetAttempts(user.Id);

        // Update last login timestamp
        user.LastLoginAt = DateTime.UtcNow;

        // Log audit event
        var auditLog = new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            EventType = AuthConstants.EventTypeLogin,
            EventDescription = "User login successful",
            IpAddress = "0.0.0.0", // Will be set by middleware in actual implementation
            UserAgent = "Unknown",
            Timestamp = DateTime.UtcNow
        };
        _dbContext.AuditLogs.Add(auditLog);

        await _dbContext.SaveChangesAsync();

        _logger.LogInformation($"User login successful: {user.Id}");

        return (user, accessToken, refreshToken);
    }
}
