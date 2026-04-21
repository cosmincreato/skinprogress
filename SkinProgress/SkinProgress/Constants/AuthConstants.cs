namespace SkinProgress.Constants;

/// <summary>
/// Authentication constants and configuration values.
/// Centralized location for security parameters: password requirements, token expiration, rate limiting.
/// </summary>
public static class AuthConstants
{
    /// Password Requirements
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 128;
    public const string PasswordRequirementMessage = "Password must be at least 8 characters with 1 uppercase letter and 1 number";

    /// JWT Token Configuration
    public const int AccessTokenExpirationMinutes = 15;
    public const int RefreshTokenExpirationDays = 7;
    public const string TokenBearerScheme = "Bearer";

    /// Email Confirmation
    public const int EmailConfirmationTokenExpirationHours = 48;
    public const int PasswordResetTokenExpirationHours = 24;
    public const int ResendConfirmationCooldownMinutes = 5;

    /// Rate Limiting
    public const int MaxFailedLoginAttempts = 3;
    public const int LoginLockoutDurationMinutes = 15;

    /// Password Hashing
    public const int PasswordHashingIterations = 10000; // PBKDF2
    public const int PasswordSaltLength = 32; // 256 bits
    public const int BcryptWorkFactor = 12; // BCrypt rounds

    /// Audit Logging Event Types
    public const string EventTypeLogin = "login";
    public const string EventTypeLogout = "logout";
    public const string EventTypePasswordChange = "password_change";
    public const string EventTypePasswordReset = "password_reset";
    public const string EventTypeEmailConfirmed = "email_confirmed";
    public const string EventTypeAccountDeleted = "account_deleted";
    public const string EventTypeDataExportRequested = "data_export_requested";
    public const string EventTypeOAuthLogin = "oauth_login";
    public const string EventTypeRateLimited = "rate_limited";
    public const string EventTypeEmailChange = "email_change";

    /// Regex patterns for validation
    public const string PasswordRegex = @"^(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$";
    public const string EmailRegex = @"^[^\s@]+@[^\s@]+\.[^\s@]+$";
}

/// <summary>
/// Enum for skin type preferences.
/// Used in UserPreferences and dashboard personalization.
/// </summary>
public enum SkinType
{
    NotSet = 0,
    Oily = 1,
    Dry = 2,
    Combination = 3,
    Sensitive = 4
}

/// <summary>
/// Enum for authentication providers.
/// Tracks which OAuth provider (or local email) user registered with.
/// </summary>
public enum AuthProvider
{
    Local = 0,
    Google = 1,
    Apple = 2
}
