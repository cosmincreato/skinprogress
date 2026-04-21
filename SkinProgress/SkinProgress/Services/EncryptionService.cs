using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using SkinProgress.Services.Interfaces;

namespace SkinProgress.Services;

/// <summary>
/// AES-256-GCM encryption service.
/// Wire format: [12-byte nonce][16-byte tag][ciphertext]
/// </summary>
public sealed class EncryptionService : IEncryptionService
{
    private const int NonceSize = 12;  // 96-bit nonce (GCM standard)
    private const int TagSize = 16;    // 128-bit authentication tag

    private readonly byte[] _key;

    public EncryptionService(IConfiguration configuration)
    {
        var keyBase64 = configuration["ENCRYPTION_KEY"];

        if (string.IsNullOrWhiteSpace(keyBase64))
            throw new InvalidOperationException(
                "ENCRYPTION_KEY is missing from configuration. " +
                "Set a Base64-encoded 32-byte key in the ENCRYPTION_KEY environment variable.");

        byte[] keyBytes;
        try
        {
            keyBytes = Convert.FromBase64String(keyBase64);
        }
        catch (FormatException ex)
        {
            throw new InvalidOperationException(
                "ENCRYPTION_KEY is not valid Base64.", ex);
        }

        if (keyBytes.Length != 32)
            throw new InvalidOperationException(
                $"ENCRYPTION_KEY must be exactly 32 bytes (256 bits) when decoded. " +
                $"Got {keyBytes.Length} bytes.");

        _key = keyBytes;
    }

    /// <inheritdoc/>
    public byte[] Encrypt(byte[] plaintext)
    {
        ArgumentNullException.ThrowIfNull(plaintext);

        var nonce = new byte[NonceSize];
        RandomNumberGenerator.Fill(nonce);

        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSize];

        using var aes = new AesGcm(_key, TagSize);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        // Wire format: [nonce (12)][tag (16)][ciphertext]
        var result = new byte[NonceSize + TagSize + ciphertext.Length];
        Buffer.BlockCopy(nonce, 0, result, 0, NonceSize);
        Buffer.BlockCopy(tag, 0, result, NonceSize, TagSize);
        Buffer.BlockCopy(ciphertext, 0, result, NonceSize + TagSize, ciphertext.Length);

        return result;
    }

    /// <inheritdoc/>
    public byte[] Decrypt(byte[] data)
    {
        ArgumentNullException.ThrowIfNull(data);

        if (data.Length < NonceSize + TagSize)
            throw new ArgumentException(
                $"Data is too short to contain nonce and tag. Minimum length: {NonceSize + TagSize}.");

        var nonce = data[..NonceSize];
        var tag = data[NonceSize..(NonceSize + TagSize)];
        var ciphertext = data[(NonceSize + TagSize)..];

        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(_key, TagSize);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);

        return plaintext;
    }

    /// <inheritdoc/>
    public string EncryptString(string plaintext)
    {
        ArgumentNullException.ThrowIfNull(plaintext);
        var bytes = Encoding.UTF8.GetBytes(plaintext);
        return Convert.ToBase64String(Encrypt(bytes));
    }

    /// <inheritdoc/>
    public string DecryptString(string ciphertext)
    {
        ArgumentNullException.ThrowIfNull(ciphertext);
        var bytes = Convert.FromBase64String(ciphertext);
        return Encoding.UTF8.GetString(Decrypt(bytes));
    }
}
