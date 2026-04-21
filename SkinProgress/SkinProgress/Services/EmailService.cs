namespace SkinProgress.Services;

using SkinProgress.Constants;

/// <summary>
/// Email service for authentication emails (confirmation, password reset).
/// Abstracts email provider (SendGrid, SMTP, Mailgun, etc).
/// Stores email templates in EmailTemplates folder for easy customization.
/// </summary>
public interface IEmailService
{
    /// <summary>
    /// Send email confirmation link.
    /// </summary>
    Task<bool> SendConfirmationEmailAsync(string email, string confirmationToken);

    /// <summary>
    /// Send password reset link.
    /// </summary>
    Task<bool> SendPasswordResetAsync(string email, string resetToken);

    /// <summary>
    /// Send generic email (for future features).
    /// </summary>
    Task<bool> SendEmailAsync(string to, string subject, string htmlBody);
}

public class EmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;
    private readonly string _fromEmail;
    private readonly string _fromName;
    private readonly string _appBaseUrl;

    public EmailService(IConfiguration configuration, ILogger<EmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;
        _fromEmail = configuration["Email:FromEmail"] ?? "noreply@skinprogress.app";
        _fromName = configuration["Email:FromName"] ?? "SkinProgress";
        _appBaseUrl = configuration["App:BaseUrl"] ?? "https://app.skinprogress.com";
    }

    /// <summary>
    /// Send email confirmation message.
    /// Token is embedded in confirmation link.
    /// </summary>
    public async Task<bool> SendConfirmationEmailAsync(string email, string confirmationToken)
    {
        try
        {
            string confirmationLink = $"{_appBaseUrl}/confirm-email?token={confirmationToken}";

            string htmlBody = $@"
                <h2>Confirm Your Email</h2>
                <p>Welcome to SkinProgress! Please confirm your email address to activate your account.</p>
                <p>
                    <a href='{confirmationLink}' style='background-color:#0ea5e9; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;'>
                        Confirm Email
                    </a>
                </p>
                <p>This link expires in {AuthConstants.EmailConfirmationTokenExpirationHours} hours.</p>
                <p>If you didn't create this account, please ignore this email.</p>
                <hr/>
                <p><small>© {DateTime.Now.Year} SkinProgress. All rights reserved.</small></p>
            ";

            return await SendEmailAsync(email, "Confirm Your SkinProgress Email", htmlBody);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Failed to send confirmation email to {email}: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Send password reset email.
    /// Token is embedded in reset link.
    /// </summary>
    public async Task<bool> SendPasswordResetAsync(string email, string resetToken)
    {
        try
        {
            string resetLink = $"{_appBaseUrl}/reset-password?token={resetToken}";

            string htmlBody = $@"
                <h2>Reset Your Password</h2>
                <p>We received a request to reset your password. Click the link below to create a new password.</p>
                <p>
                    <a href='{resetLink}' style='background-color:#0ea5e9; color:white; padding:10px 20px; text-decoration:none; border-radius:5px; display:inline-block;'>
                        Reset Password
                    </a>
                </p>
                <p>This link expires in {AuthConstants.PasswordResetTokenExpirationHours} hours.</p>
                <p>If you didn't request this reset, please ignore this email. Your account remains secure.</p>
                <hr/>
                <p><small>© {DateTime.Now.Year} SkinProgress. All rights reserved.</small></p>
            ";

            return await SendEmailAsync(email, "Reset Your SkinProgress Password", htmlBody);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Failed to send password reset email to {email}: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// Generic email send method.
    /// Delegates to actual email provider based on configuration.
    /// Current implementation: logs email (for development).
    /// TODO: Integrate with SendGrid, SMTP, or other provider.
    /// </summary>
    public async Task<bool> SendEmailAsync(string to, string subject, string htmlBody)
    {
        try
        {
            string emailProvider = _configuration["Email:Provider"] ?? "console";

            switch (emailProvider.ToLower())
            {
                case "sendgrid":
                    return await SendViaProvider(to, subject, htmlBody, "SendGrid");
                case "smtp":
                    return await SendViaProvider(to, subject, htmlBody, "SMTP");
                case "console":
                default:
                    // Development mode: log to console
                    _logger.LogInformation($"[DEVELOPMENT] Email sent to {to}: {subject}");
                    _logger.LogInformation($"[DEVELOPMENT] Body: {htmlBody}");
                    return true;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"Email send failed: {ex.Message}");
            return false;
        }
    }

    private async Task<bool> SendViaProvider(string to, string subject, string htmlBody, string provider)
    {
        // Placeholder for actual email provider implementation
        // TODO: Implement SendGrid integration
        // TODO: Implement SMTP integration

        _logger.LogInformation($"[{provider}] Email sent to {to}: {subject}");
        await Task.CompletedTask; // Simulate async operation
        return true;
    }
}
