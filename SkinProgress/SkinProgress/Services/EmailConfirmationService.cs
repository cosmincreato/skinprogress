using Microsoft.EntityFrameworkCore;
using SkinProgress.Data;
using SkinProgress.Models.Entities;
using SkinProgress.Constants;

namespace SkinProgress.Services;

/// <summary>
/// Email confirmation service for verifying user email addresses.
/// Generates tokens, validates them, and marks emails as confirmed.
/// Tokens expire after 48 hours.
/// </summary>
public interface IEmailConfirmationService
{
    /// <summary>
    /// Generate and store email confirmation token for user.
    /// Token valid for 48 hours.
    /// </summary>
    Task<string> GenerateConfirmationTokenAsync(Guid userId);

    /// <summary>
    /// Validate and confirm email using token.
    /// Marks user's email as confirmed.
    /// Throws InvalidOperationException if token invalid or expired.
    /// </summary>
    Task<bool> ConfirmEmailAsync(string token);

    /// <summary>
    /// Get user from confirmation token.
    /// Returns null if token invalid or expired.
    /// </summary>
    Task<User?> GetUserFromTokenAsync(string token);

    /// <summary>
    /// Resend confirmation email. No-ops silently if account doesn't exist or is already confirmed.
    /// Rate-limited to one resend per ResendConfirmationCooldownMinutes.
    /// Throws InvalidOperationException if cooldown has not elapsed.
    /// </summary>
    Task ResendConfirmationEmailAsync(string email, IEmailService emailService);
}

public class EmailConfirmationService : IEmailConfirmationService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<EmailConfirmationService> _logger;

    public EmailConfirmationService(
        AppDbContext dbContext,
        ILogger<EmailConfirmationService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    /// <summary>
    /// Generate new confirmation token and store in database.
    /// Token expires in 48 hours.
    /// </summary>
    public async Task<string> GenerateConfirmationTokenAsync(Guid userId)
    {
        // Check user exists
        var user = await _dbContext.Users.FindAsync(userId);
        if (user == null)
        {
            throw new InvalidOperationException($"User {userId} not found");
        }

        // Generate token (GUID for simplicity; use cryptographically secure random in production)
        string token = Guid.NewGuid().ToString("N");

        // Create confirmation token record
        var confirmationToken = new UserEmailConfirmationToken
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Token = token,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddHours(AuthConstants.EmailConfirmationTokenExpirationHours)
        };

        _dbContext.UserEmailConfirmationTokens.Add(confirmationToken);
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation($"Confirmation token generated for user {userId}");

        return token;
    }

    /// <summary>
    /// Confirm email using token.
    /// 1. Find token in database
    /// 2. Validate not expired
    /// 3. Mark user's email as confirmed
    /// 4. Delete token
    /// Returns true if successful, throws exception if invalid/expired
    /// </summary>
    public async Task<bool> ConfirmEmailAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("Confirmation token is required");
        }

        // Normalize input: convert to uppercase and trim whitespace
        token = token.Trim().ToUpper();

        // Find token - handle both full tokens and shortened 6-char codes
        // If token is 6 chars or less, search for tokens that START with that code
        // Otherwise, do exact match
        UserEmailConfirmationToken confirmationToken;
        
        if (token.Length <= 6)
        {
            // User entered the 6-character code from email
            // Find any token that starts with this prefix (case-insensitive)
            confirmationToken = await _dbContext.UserEmailConfirmationTokens
                .FirstOrDefaultAsync(t => t.Token.ToUpper().StartsWith(token));
        }
        else
        {
            // Full token provided
            confirmationToken = await _dbContext.UserEmailConfirmationTokens
                .FirstOrDefaultAsync(t => t.Token.ToUpper() == token);
        }

        if (confirmationToken == null)
        {
            _logger.LogWarning($"Invalid confirmation token attempted: {token}");
            throw new InvalidOperationException("Invalid confirmation token");
        }

        // Check if token expired
        if (!confirmationToken.IsValid)
        {
            _logger.LogWarning($"Expired confirmation token for user {confirmationToken.UserId}");
            throw new InvalidOperationException("Confirmation token has expired");
        }

        // Get user
        var user = await _dbContext.Users.FindAsync(confirmationToken.UserId);
        if (user == null)
        {
            throw new InvalidOperationException("User not found");
        }

        // Mark email as confirmed
        user.EmailConfirmed = true;
        user.EmailConfirmedAt = DateTime.UtcNow;

        // Delete token
        _dbContext.UserEmailConfirmationTokens.Remove(confirmationToken);

        await _dbContext.SaveChangesAsync();

        _logger.LogInformation($"Email confirmed for user {user.Id}");

        return true;
    }

    /// <summary>
    /// Get user associated with confirmation token.
    /// Returns null if token invalid or expired.
    /// </summary>
    public async Task<User?> GetUserFromTokenAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        var confirmationToken = await _dbContext.UserEmailConfirmationTokens
            .FirstOrDefaultAsync(t => t.Token == token);

        if (confirmationToken == null || !confirmationToken.IsValid)
        {
            return null;
        }

        return await _dbContext.Users.FindAsync(confirmationToken.UserId);
    }

    public async Task ResendConfirmationEmailAsync(string email, IEmailService emailService)
    {
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Email == email.Trim().ToLower());

        // Silently no-op if account doesn't exist or is already confirmed
        if (user == null || user.EmailConfirmed)
            return;

        // Enforce cooldown
        var recent = await _dbContext.UserEmailConfirmationTokens
            .Where(t => t.UserId == user.Id)
            .OrderByDescending(t => t.CreatedAt)
            .FirstOrDefaultAsync();

        if (recent != null && recent.CreatedAt > DateTime.UtcNow.AddMinutes(-AuthConstants.ResendConfirmationCooldownMinutes))
        {
            var waitSeconds = (int)(recent.CreatedAt.AddMinutes(AuthConstants.ResendConfirmationCooldownMinutes) - DateTime.UtcNow).TotalSeconds;
            throw new InvalidOperationException($"Please wait {waitSeconds} seconds before requesting another code.");
        }

        var token = await GenerateConfirmationTokenAsync(user.Id);

        try
        {
            await emailService.SendConfirmationEmailAsync(user.Email!, token);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Failed to resend confirmation email to {user.Email}: {ex.Message}");
        }
    }
}
