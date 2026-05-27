namespace SkinProgress.Services;

using SkinProgress.Constants;
using System.Net;
using System.Net.Mail;

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
    /// Token is sent as a code to copy/paste instead of a clickable link.
    /// </summary>
    public async Task<bool> SendConfirmationEmailAsync(string email, string confirmationToken)
    {
        try
        {
            string htmlBody = $@"
                <h2>Confirm Your Email</h2>
                <p>Welcome to SkinProgress! Please confirm your email address to activate your account.</p>
                <p>Enter this code to verify your email:</p>
                <div style='background-color: #f3f4f6; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;'>
                    <p style='font-size: 24px; font-weight: bold; color: #0ea5e9; letter-spacing: 2px; margin: 0;'>{confirmationToken.ToUpper().Substring(0, Math.Min(6, confirmationToken.Length))}</p>
                </div>
                <p style='text-align: center; color: #666;'>This code expires in {AuthConstants.EmailConfirmationTokenExpirationHours} hours.</p>
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
    /// Token is sent as a code to copy/paste instead of a clickable link.
    /// </summary>
    public async Task<bool> SendPasswordResetAsync(string email, string resetToken)
    {
        try
        {
            string htmlBody = $@"
                <h2>Reset Your Password</h2>
                <p>We received a request to reset your password. Use this code to create a new password:</p>
                <div style='background-color: #f3f4f6; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;'>
                    <p style='font-size: 24px; font-weight: bold; color: #0ea5e9; letter-spacing: 2px; margin: 0;'>{resetToken.ToUpper().Substring(0, Math.Min(6, resetToken.Length))}</p>
                </div>
                <p style='text-align: center; color: #666;'>This code expires in {AuthConstants.PasswordResetTokenExpirationHours} hours.</p>
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
        try
        {
            if (provider.ToLower() == "smtp")
            {
                return await SendViaSMTPAsync(to, subject, htmlBody);
            }
            else if (provider.ToLower() == "sendgrid")
            {
                _logger.LogWarning($"[SendGrid] Integration not implemented. Email to {to} not sent.");
                return false;
            }

            _logger.LogInformation($"[{provider}] Email sent to {to}: {subject}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError($"[{provider}] Error sending email to {to}: {ex.Message}");
            return false;
        }
    }

    private async Task<bool> SendViaSMTPAsync(string to, string subject, string htmlBody)
    {
        try
        {
            var smtpSettings = _configuration.GetSection("Email:Smtp");
            var smtpHost = smtpSettings["Host"];
            var smtpPortStr = smtpSettings["Port"];
            var smtpUsername = smtpSettings["Username"];
            var smtpPassword = smtpSettings["Password"];

            if (string.IsNullOrWhiteSpace(smtpHost) || string.IsNullOrWhiteSpace(smtpPortStr))
            {
                _logger.LogError("SMTP settings are not configured (Host and Port are required)");
                return false;
            }

            if (!int.TryParse(smtpPortStr, out var smtpPort))
            {
                _logger.LogError($"Invalid SMTP port: {smtpPortStr}");
                return false;
            }

            using (var client = new SmtpClient(smtpHost, smtpPort))
            {
                // Only enable SSL for non-localhost production servers
                // Mailpit on localhost doesn't support SSL on port 1025
                client.EnableSsl = !smtpHost.Contains("localhost") && smtpPort != 1025;
                client.DeliveryMethod = SmtpDeliveryMethod.Network;
                client.Timeout = 10000; // 10 second timeout

                // Use credentials if provided
                if (!string.IsNullOrWhiteSpace(smtpUsername) && !string.IsNullOrWhiteSpace(smtpPassword))
                {
                    client.Credentials = new NetworkCredential(smtpUsername, smtpPassword);
                }

                using (var message = new MailMessage())
                {
                    message.From = new MailAddress(_fromEmail, _fromName);
                    message.To.Add(new MailAddress(to));
                    message.Subject = subject;
                    message.Body = htmlBody;
                    message.IsBodyHtml = true;

                    await client.SendMailAsync(message);
                    _logger.LogInformation($"[SMTP] Email successfully sent to {to}: {subject}");
                    return true;
                }
            }
        }
        catch (SmtpException ex)
        {
            _logger.LogError($"[SMTP] SmtpException sending email to {to}: {ex.Message}");
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError($"[SMTP] Error sending email to {to}: {ex.Message}");
            return false;
        }
    }
}
