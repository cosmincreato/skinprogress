using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SkinProgress.Constants;

namespace SkinProgress.Services;

/// <summary>
/// JWT token generation and validation service.
/// Generates secure Bearer tokens for API authentication.
/// Access tokens: 15 minute expiration
/// Refresh tokens: 7 day expiration
/// </summary>
public interface IJwtTokenService
{
    /// <summary>
    /// Generate access token (15 minute expiration).
    /// </summary>
    string GenerateAccessToken(Guid userId, string email);

    /// <summary>
    /// Generate refresh token (7 day expiration).
    /// </summary>
    string GenerateRefreshToken();

    /// <summary>
    /// Validate token and extract claims.
    /// Throws SecurityTokenException if invalid.
    /// </summary>
    ClaimsPrincipal ValidateToken(string token);

    /// <summary>
    /// Extract claims from token without validation (for logging).
    /// </summary>
    IEnumerable<Claim>? TryExtractClaims(string token);
}

public class JwtTokenService : IJwtTokenService
{
    private readonly string _jwtSecret;
    private readonly string _jwtIssuer;
    private readonly string _jwtAudience;
    private readonly ILogger<JwtTokenService> _logger;

    public JwtTokenService(IConfiguration configuration, ILogger<JwtTokenService> logger)
    {
        _logger = logger;

        // Read JWT configuration from appsettings
        _jwtSecret = configuration["Jwt:Secret"]
            ?? throw new InvalidOperationException("JWT Secret not configured in appsettings");
        _jwtIssuer = configuration["Jwt:Issuer"] ?? "SkinProgress";
        _jwtAudience = configuration["Jwt:Audience"] ?? "SkinProgressUsers";

        if (_jwtSecret.Length < 32)
        {
            throw new InvalidOperationException("JWT Secret must be at least 32 characters (256 bits)");
        }
    }

    /// <summary>
    /// Generate access token valid for 15 minutes.
    /// Contains minimal claims: sub (userId), email, roles
    /// </summary>
    public string GenerateAccessToken(Guid userId, string email)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.ASCII.GetBytes(_jwtSecret);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Email, email),
            new Claim("scope", "access")
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(AuthConstants.AccessTokenExpirationMinutes),
            Issuer = _jwtIssuer,
            Audience = _jwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    /// <summary>
    /// Generate refresh token valid for 7 days.
    /// Refresh tokens should be stored in database and marked as revoked when used.
    /// </summary>
    public string GenerateRefreshToken()
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.ASCII.GetBytes(_jwtSecret);

        var claims = new List<Claim>
        {
            new Claim("scope", "refresh"),
            new Claim("jti", Guid.NewGuid().ToString()) // JWT ID for revocation tracking
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddDays(AuthConstants.RefreshTokenExpirationDays),
            Issuer = _jwtIssuer,
            Audience = _jwtAudience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    /// <summary>
    /// Validate token and return claims principal.
    /// Throws SecurityTokenException if token is invalid or expired.
    /// </summary>
    public ClaimsPrincipal ValidateToken(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.ASCII.GetBytes(_jwtSecret);

            var principal = tokenHandler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(key),
                ValidateIssuer = true,
                ValidIssuer = _jwtIssuer,
                ValidateAudience = true,
                ValidAudience = _jwtAudience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero // No grace period for expired tokens
            }, out SecurityToken validatedToken);

            return principal;
        }
        catch (Exception ex)
        {
            _logger.LogWarning($"Token validation failed: {ex.Message}");
            throw new SecurityTokenException("Invalid or expired token", ex);
        }
    }

    /// <summary>
    /// Safely extract claims without validation.
    /// Used for logging/debugging purposes only.
    /// Returns null if token cannot be parsed.
    /// </summary>
    public IEnumerable<Claim>? TryExtractClaims(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var jwtToken = tokenHandler.ReadJwtToken(token);
            return jwtToken?.Claims;
        }
        catch
        {
            return null;
        }
    }
}
