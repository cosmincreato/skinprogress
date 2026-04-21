using Microsoft.Extensions.Caching.Memory;
using SkinProgress.Constants;

namespace SkinProgress.Services;

/// <summary>
/// Rate limiting service for failed login attempts.
/// Implements simple in-memory rate limiting: 3 failed attempts = 15 minute lockout.
/// For distributed deployments, replace with Redis-based implementation.
/// </summary>
public interface IRateLimitService
{
    /// <summary>
    /// Increment failed login attempt counter for user.
    /// </summary>
    void IncrementFailedAttempt(Guid userId);

    /// <summary>
    /// Check if user account is locked due to too many attempts.
    /// </summary>
    bool IsLockedOut(Guid userId);

    /// <summary>
    /// Reset failed attempt counter after successful login.
    /// </summary>
    void ResetAttempts(Guid userId);

    /// <summary>
    /// Get current failed attempt count for user.
    /// </summary>
    int GetAttemptCount(Guid userId);
}

public class RateLimitService : IRateLimitService
{
    private readonly IMemoryCache _cache;
    private readonly ILogger<RateLimitService> _logger;

    private const string FailedAttemptsKeyPrefix = "failed_login_attempts_";
    private const string LockoutKeyPrefix = "login_lockout_";

    public RateLimitService(IMemoryCache cache, ILogger<RateLimitService> logger)
    {
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Increment failed attempt counter.
    /// If counter reaches max attempts, set lockout timestamp.
    /// </summary>
    public void IncrementFailedAttempt(Guid userId)
    {
        string attemptsKey = FailedAttemptsKeyPrefix + userId;
        int attempts = GetAttemptCount(userId);
        attempts++;

        // Store failed attempts count with 15-minute expiration
        var cacheOptions = new MemoryCacheEntryOptions()
            .SetAbsoluteExpiration(TimeSpan.FromMinutes(AuthConstants.LoginLockoutDurationMinutes));

        _cache.Set(attemptsKey, attempts, cacheOptions);

        // If max attempts reached, set lockout timestamp
        if (attempts >= AuthConstants.MaxFailedLoginAttempts)
        {
            string lockoutKey = LockoutKeyPrefix + userId;
            _cache.Set(lockoutKey, true, cacheOptions);
            _logger.LogWarning($"User {userId} locked out after {attempts} failed attempts");
        }

        _logger.LogInformation($"Failed login attempt {attempts}/{AuthConstants.MaxFailedLoginAttempts} for user {userId}");
    }

    /// <summary>
    /// Check if user is currently locked out.
    /// </summary>
    public bool IsLockedOut(Guid userId)
    {
        string lockoutKey = LockoutKeyPrefix + userId;
        return _cache.TryGetValue(lockoutKey, out _);
    }

    /// <summary>
    /// Reset attempt counter after successful login.
    /// </summary>
    public void ResetAttempts(Guid userId)
    {
        string attemptsKey = FailedAttemptsKeyPrefix + userId;
        string lockoutKey = LockoutKeyPrefix + userId;

        _cache.Remove(attemptsKey);
        _cache.Remove(lockoutKey);

        _logger.LogInformation($"Failed attempt counter reset for user {userId}");
    }

    /// <summary>
    /// Get current attempt count (returns 0 if not found or expired).
    /// </summary>
    public int GetAttemptCount(Guid userId)
    {
        string attemptsKey = FailedAttemptsKeyPrefix + userId;
        return _cache.TryGetValue(attemptsKey, out int count) ? count : 0;
    }
}
