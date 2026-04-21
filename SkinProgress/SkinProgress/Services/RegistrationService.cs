using Microsoft.EntityFrameworkCore;
using SkinProgress.Services.Interfaces;
using SkinProgress.Data;
using SkinProgress.Models.Entities;
using SkinProgress.Constants;

namespace SkinProgress.Services;

/// <summary>
/// User registration service for email-based account creation.
/// Validates input, prevents duplicate emails, hashes password, and creates user account.
/// </summary>
public interface IRegistrationService
{
    /// <summary>
    /// Register new user with email and password.
    /// Throws InvalidOperationException if email already registered or password invalid.
    /// Returns User object with confirmation token.
    /// </summary>
    Task<(User user, string confirmationToken)> RegisterUserAsync(string email, string password, string confirmPassword);
}

public class RegistrationService : IRegistrationService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHashingService _passwordHashingService;
    private readonly ILogger<RegistrationService> _logger;

    public RegistrationService(
        AppDbContext dbContext,
        IPasswordHashingService passwordHashingService,
        ILogger<RegistrationService> logger)
    {
        _dbContext = dbContext;
        _passwordHashingService = passwordHashingService;
        _logger = logger;
    }

    /// <summary>
    /// Register new user with validation.
    /// 1. Validate email format and uniqueness
    /// 2. Validate password strength
    /// 3. Hash password
    /// 4. Create user record
    /// 5. Return user + confirmation token for email verification
    /// </summary>
    public async Task<(User user, string confirmationToken)> RegisterUserAsync(
        string email,
        string password,
        string confirmPassword)
    {
        // Validate inputs
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new ArgumentException("Email cannot be empty", nameof(email));
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Password cannot be empty", nameof(password));
        }

        // Validate email format (basic regex)
        if (!System.Text.RegularExpressions.Regex.IsMatch(email, AuthConstants.EmailRegex))
        {
            throw new InvalidOperationException("Email format is invalid");
        }

        // Validate password match
        if (password != confirmPassword)
        {
            throw new InvalidOperationException("Passwords do not match");
        }

        // Validate password strength
        ValidatePasswordStrength(password);

        // Check if email already exists
        var existingUser = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Email == email);

        if (existingUser != null)
        {
            _logger.LogWarning($"Registration attempt with existing email: {email}");
            throw new InvalidOperationException("Email is already registered. Please log in or reset your password.");
        }

        // Hash password
        var (passwordHash, passwordSalt) = _passwordHashingService.HashPassword(password);

        // Create new user
        var newUser = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = email.Split('@')[0], // Use email prefix as initial username
            PasswordHash = passwordHash,
            PasswordSalt = passwordSalt,
            EmailConfirmed = false,
            Provider = "Local",
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Users.Add(newUser);
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation($"User registered: {email}");

        // Generate confirmation token (GUID for simplicity; in production use secure random string)
        string confirmationToken = Guid.NewGuid().ToString("N");

        return (newUser, confirmationToken);
    }

    /// <summary>
    /// Validate password meets security requirements.
    /// Requirements: 8+ chars, 1 uppercase, 1 number
    /// </summary>
    private void ValidatePasswordStrength(string password)
    {
        if (password.Length < AuthConstants.MinPasswordLength)
        {
            throw new InvalidOperationException(
                $"Password must be at least {AuthConstants.MinPasswordLength} characters");
        }

        if (!System.Text.RegularExpressions.Regex.IsMatch(password, AuthConstants.PasswordRegex))
        {
            throw new InvalidOperationException(AuthConstants.PasswordRequirementMessage);
        }
    }
}
