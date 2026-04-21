using SkinProgress.Services.Interfaces;

namespace SkinProgress.Services;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Google.Apis.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Data;
using Models.DTOs;
using Models.Entities;
using Models;

public class AuthService : IAuthService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _config;

    public AuthService(AppDbContext context, IConfiguration config)
    {
        _context = context;
        _config = config;
    }

    public async Task<AuthResponseDto?> RegisterAsync(RegisterDto dto)
    {
        // Check if a user with this email or username already exists
        if (await _context.Users.AnyAsync(u => u.Email == dto.Email || u.Username == dto.Username))
            return null;

        var user = new User
        {
            Email = dto.Email,
            Username = dto.Username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Provider = "Local",
            Role = UserRoles.User // Default role
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return new AuthResponseDto(GenerateJwtToken(user), user.Username, user.Email);
    }

    public async Task<AuthResponseDto?> LoginAsync(LoginDto dto)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == dto.Email);

        if (user == null || user.PasswordHash == null ||
            !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            return null;

        return new AuthResponseDto(GenerateJwtToken(user), user.Username, user.Email);
    }

    public async Task<AuthResponseDto?> GoogleAuthAsync(string idToken)
    {
        if (string.IsNullOrWhiteSpace(idToken))
            return null;

        var clientId = _config["Google:ClientId"];
        if (string.IsNullOrEmpty(clientId))
            return null;

        GoogleJsonWebSignature.Payload payload;
        try
        {
            var validationSettings = new GoogleJsonWebSignature.ValidationSettings
            {
                Audience = new[] { clientId }
            };
            payload = await GoogleJsonWebSignature.ValidateAsync(idToken, validationSettings);
        }
        catch
        {
            return null;
        }

        var email = payload.Email;
        if (string.IsNullOrEmpty(email))
            return null;

        var name = payload.Name;
        var picture = payload.Picture;
        var sub = payload.Subject;
        if (string.IsNullOrWhiteSpace(sub))
            return null;

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.ExternalId == sub || (u.Email == email && u.Provider == "Google"));

        if (user != null)
        {
            if (user.Provider != "Google")
                return null; // Email already used with password
            return new AuthResponseDto(GenerateJwtToken(user), user.Username, user.Email);
        }

        var existingByEmail = await _context.Users.AnyAsync(u => u.Email == email);
        if (existingByEmail)
            return null; // Email registered locally, use password

        var baseUsername = !string.IsNullOrWhiteSpace(name)
            ? SanitizeUsername(name)
            : email.Split('@')[0];
        var username = await EnsureUniqueUsernameAsync(baseUsername, sub);

        user = new User
        {
            Email = email,
            Username = username,
            PasswordHash = null,
            Provider = "Google",
            ExternalId = sub,
            Role = UserRoles.User,
            ProfilePictureUrl = !string.IsNullOrEmpty(picture) ? picture : "/uploads/default.png"
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        return new AuthResponseDto(GenerateJwtToken(user), user.Username, user.Email);
    }

    private static string SanitizeUsername(string name)
    {
        var s = new string(name.Where(c => char.IsLetterOrDigit(c) || c == '_' || c == '-').ToArray());
        return string.IsNullOrEmpty(s) ? "user" : s.Length > 100 ? s[..100] : s;
    }

    private async Task<string> EnsureUniqueUsernameAsync(string baseUsername, string sub)
    {
        var suffix = sub.Length >= 6 ? sub[..6] : sub;
        var candidate = baseUsername;
        var i = 0;
        while (await _context.Users.AnyAsync(u => u.Username == candidate))
            candidate = $"{baseUsername}_{suffix}{i++}";
        return candidate;
    }

    public async Task<UserDto?> GetMeAsync(string userId)
    {
        var user = await _context.Users.FindAsync(Guid.Parse(userId));
        if (user == null) return null;

        return new UserDto(user.Id, user.Email, user.Username, user.Role, user.SkinType, user.ProfilePictureUrl, user.CreatedAt, user.LastSelfieAt);
    }

    private string GenerateJwtToken(User user)
    {
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role) // Add Role to claims
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7), // Use UtcNow for consistency
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}