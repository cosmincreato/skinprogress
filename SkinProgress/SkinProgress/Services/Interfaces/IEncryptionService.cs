namespace SkinProgress.Services.Interfaces;

public interface IEncryptionService
{
    /// <summary>
    /// Encrypts a byte array using AES-256-GCM.
    /// Returns wire format: [12-byte nonce][16-byte tag][ciphertext]
    /// </summary>
    byte[] Encrypt(byte[] plaintext);

    /// <summary>
    /// Decrypts a byte array encrypted with <see cref="Encrypt"/>.
    /// Expects wire format: [12-byte nonce][16-byte tag][ciphertext]
    /// </summary>
    byte[] Decrypt(byte[] ciphertext);

    /// <summary>
    /// Convenience wrapper: encrypts a UTF-8 string and returns Base64.
    /// </summary>
    string EncryptString(string plaintext);

    /// <summary>
    /// Convenience wrapper: decrypts a Base64 string produced by <see cref="EncryptString"/>.
    /// </summary>
    string DecryptString(string ciphertext);
}
