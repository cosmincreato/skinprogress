using Microsoft.EntityFrameworkCore;
using SkinProgress.Constants;
using SkinProgress.Data;
using SkinProgress.Models.Entities;

namespace SkinProgress.Services;

/// <summary>
/// Password reset service for managing password reset tokens and resetting user passwords.
/// Generates tokens, validates them, and allows password updates.
/// Tokens expire after 24 hours.
/// </summary>
public interface IPasswordResetService
{
    /// <summary>
    /// Generate and store password reset token for user email.
    /// Token valid for 24 hours.
    /// </summary>
    Task<string> GeneratePasswordResetTokenAsync(string email);

    /// <summary>
    /// Validate password reset token and reset password.
    /// Marks token as used.
    /// Throws InvalidOperationException if token invalid or expired.
    /// </summary>
    Task<bool> ResetPasswordAsync(string token, string newPassword, IPasswordHashingService passwordHashingService);

    /// <summary>
    /// Get user from password reset token.
    /// Returns null if token invalid or expired.
    /// </summary>
    Task<User?> GetUserFromTokenAsync(string token);
}

public class PasswordResetService : IPasswordResetService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<PasswordResetService> _logger;

    public PasswordResetService(
        AppDbContext dbContext,
        ILogger<PasswordResetService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    /// <summary>
    /// Generate new password reset token and store in database.
    /// Token expires in 24 hours.
    /// </summary>
    public async Task<string> GeneratePasswordResetTokenAsync(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            throw new InvalidOperationException("Email is required");
        }

        // Find user by email
        var user = await _dbContext.Users
            .FirstOrDefaultAsync(u => u.Email == email);

        if (user == null)
        {
            // Don't reveal if email exists
            _logger.LogWarning($"Password reset requested for non-existent email: {email}");
            throw new InvalidOperationException($"If an account exists with {email}, you will receive a password reset email.");
        }

        // Check if user has password (local auth)
        if (string.IsNullOrEmpty(user.PasswordHash))
        {
            _logger.LogWarning($"Password reset requested for OAuth-only user: {user.Id}");
            throw new InvalidOperationException("This account uses social login. Please login with your social account.");
        }

        // Generate 6-character token for user
        string token = GenerateShortToken();

        // Remove any existing unused tokens for this user
        var existingTokens = _dbContext.PasswordResetTokens
            .Where(t => t.UserId == user.Id && !t.IsUsed)
            .ToList();
        
        foreach (var existingToken in existingTokens)
        {
            _dbContext.PasswordResetTokens.Remove(existingToken);
        }

        // Create password reset token record
        var resetToken = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = token,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddHours(AuthConstants.PasswordResetTokenExpirationHours),
            IsUsed = false
        };

        _dbContext.PasswordResetTokens.Add(resetToken);
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation($"Password reset token generated for user {user.Id}");

        return token;
    }

    /// <summary>
    /// Generate a 6-character random token (uppercase alphanumeric).
    /// </summary>
    private string GenerateShortToken()
    {
        const string chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var random = new System.Random();
        return new string(Enumerable.Range(0, 6).Select(_ => chars[random.Next(chars.Length)]).ToArray());
    }

    /// <summary>
    /// Reset password using token.
    /// 1. Find token in database
    /// 2. Validate not expired and not used
    /// 3. Update user's password
    /// 4. Mark token as used
    /// Returns true if successful, throws exception if invalid/expired
    /// </summary>
    public async Task<bool> ResetPasswordAsync(string token, string newPassword, IPasswordHashingService passwordHashingService)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("Password reset token is required");
        }

        if (string.IsNullOrWhiteSpace(newPassword))
        {
            throw new InvalidOperationException("New password is required");
        }

        // Validate password meets requirements
        if (newPassword.Length < AuthConstants.MinPasswordLength || newPassword.Length > AuthConstants.MaxPasswordLength)
        {
            throw new InvalidOperationException($"Password must be between {AuthConstants.MinPasswordLength} and {AuthConstants.MaxPasswordLength} characters");
        }

        // Normalize input
        token = token.Trim().ToUpper();

        // Find token (case-insensitive comparison)
        var resetToken = await _dbContext.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash.ToUpper() == token);

        if (resetToken == null)
        {
            _logger.LogWarning($"Invalid password reset token attempt");
            throw new InvalidOperationException("Invalid password reset token");
        }

        // Check if token is expired
        if (resetToken.ExpiresAt < DateTime.UtcNow)
        {
            _logger.LogWarning($"Expired password reset token used for user {resetToken.UserId}");
            throw new InvalidOperationException("Password reset token has expired. Please request a new one.");
        }

        // Check if token has already been used
        if (resetToken.IsUsed)
        {
            _logger.LogWarning($"Already-used password reset token used again for user {resetToken.UserId}");
            throw new InvalidOperationException("This password reset token has already been used.");
        }

        // Update user's password
        var user = resetToken.User;
        if (user == null)
        {
            throw new InvalidOperationException("User not found");
        }

        var (passwordHash, passwordSalt) = passwordHashingService.HashPassword(newPassword);
        user.PasswordHash = passwordHash;
        user.PasswordSalt = passwordSalt;

        // Mark token as used
        resetToken.IsUsed = true;

        // Log audit event
        var auditLog = new AuditLog
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            EventType = AuthConstants.EventTypePasswordReset,
            EventDescription = "Password reset successful",
            IpAddress = "0.0.0.0",
            UserAgent = "Unknown",
            Timestamp = DateTime.UtcNow
        };
        _dbContext.AuditLogs.Add(auditLog);

        await _dbContext.SaveChangesAsync();

        _logger.LogInformation($"Password reset successful for user {user.Id}");

        return true;
    }

    /// <summary>
    /// Get user from password reset token.
    /// Returns null if token invalid or expired.
    /// </summary>
    public async Task<User?> GetUserFromTokenAsync(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        token = token.Trim().ToUpper();

        var resetToken = await _dbContext.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash.ToUpper() == token && !t.IsUsed && t.ExpiresAt >= DateTime.UtcNow);

        return resetToken?.User;
    }
}
