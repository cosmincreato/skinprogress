using System.Security.Cryptography;
using System.Text;
using SkinProgress.Constants;

namespace SkinProgress.Services;

/// <summary>
/// Password hashing service using PBKDF2 with SHA-256.
/// Implements secure password storage and verification without plaintext comparison.
/// Configuration: 10,000 iterations (NIST recommended), 256-bit salt
/// </summary>
public interface IPasswordHashingService
{
    /// <summary>
    /// Hash a plaintext password with generated salt.
    /// Returns tuple of (hash, salt) both base64 encoded.
    /// </summary>
    (string hash, string salt) HashPassword(string plaintext);

    /// <summary>
    /// Verify plaintext password matches stored hash.
    /// </summary>
    bool VerifyPassword(string plaintext, string hash, string salt);
}

public class PasswordHashingService : IPasswordHashingService
{
    private const int IterationCount = AuthConstants.PasswordHashingIterations;
    private const int SaltLength = AuthConstants.PasswordSaltLength; // 32 bytes = 256 bits
    private const int HashLength = 32; // 256 bits for SHA-256

    /// <summary>
    /// Hash password using PBKDF2-SHA256.
    /// Generate random salt, derive key, return both as base64.
    /// </summary>
    public (string hash, string salt) HashPassword(string plaintext)
    {
        if (string.IsNullOrWhiteSpace(plaintext))
        {
            throw new ArgumentException("Password cannot be empty", nameof(plaintext));
        }

        // Generate random salt
        byte[] saltBytes = new byte[SaltLength];
        using (var rng = RandomNumberGenerator.Create())
        {
            rng.GetBytes(saltBytes);
        }

        // Derive key using PBKDF2
        using (var pbkdf2 = new Rfc2898DeriveBytes(plaintext, saltBytes, IterationCount, HashAlgorithmName.SHA256))
        {
            byte[] hashBytes = pbkdf2.GetBytes(HashLength);

            // Return base64 encoded strings for storage in database
            string hashBase64 = Convert.ToBase64String(hashBytes);
            string saltBase64 = Convert.ToBase64String(saltBytes);

            return (hashBase64, saltBase64);
        }
    }

    /// <summary>
    /// Verify plaintext password against stored hash and salt.
    /// Reconstruct hash from plaintext + salt and compare.
    /// Uses constant-time comparison to protect against timing attacks.
    /// </summary>
    public bool VerifyPassword(string plaintext, string hash, string salt)
    {
        if (string.IsNullOrWhiteSpace(plaintext) || string.IsNullOrWhiteSpace(hash) || string.IsNullOrWhiteSpace(salt))
        {
            return false;
        }

        try
        {
            // Decode salt from base64
            byte[] saltBytes = Convert.FromBase64String(salt);
            byte[] hashBytes = Convert.FromBase64String(hash);

            // Derive key from plaintext using same salt
            using (var pbkdf2 = new Rfc2898DeriveBytes(plaintext, saltBytes, IterationCount, HashAlgorithmName.SHA256))
            {
                byte[] derivedKey = pbkdf2.GetBytes(HashLength);

                // Constant-time comparison to prevent timing attacks
                // CryptographicOperations.FixedTimeEquals throws if lengths don't match
                bool matches = CryptographicOperations.FixedTimeEquals(derivedKey, hashBytes);
                return matches;
            }
        }
        catch (Exception)
        {
            // Invalid base64 or other decoding errors = invalid password
            return false;
        }
    }
}
