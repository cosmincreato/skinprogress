using FsCheck;
using FsCheck.Fluent;
using Microsoft.Extensions.Configuration;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using SkinProgress.Services;
using System;
using System.Collections.Generic;
using System.Security.Cryptography;

namespace SkinProgress.Tests;

/// <summary>
/// Property-based tests for <see cref="EncryptionService"/>.
///
/// Property 17: Encryption Round-Trip
/// For any arbitrary byte array input, encrypting then decrypting must return the original bytes exactly.
/// </summary>
[TestClass]
public class EncryptionServicePropertyTests
{
    // A deterministic 32-byte test key (Base64-encoded). Never use in production.
    private const string TestKeyBase64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    private static EncryptionService CreateService(string? keyBase64 = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ENCRYPTION_KEY"] = keyBase64 ?? TestKeyBase64
            })
            .Build();

        return new EncryptionService(config);
    }

    // Property 17: Encryption Round-Trip — for any byte[] input, Decrypt(Encrypt(input)) == input

    /// <summary>
    /// Property 17: Encryption Round-Trip
    /// For any arbitrary byte array (including empty), encrypting then decrypting returns the original bytes.
    /// </summary>
    [TestMethod]
    public void Property17_EncryptionRoundTrip_ArbitraryBytes()
    {
        var service = CreateService();

        var arb = ArbMap.Default.ArbFor<byte[]>();

        Prop.ForAll(arb, plaintext =>
        {
            plaintext ??= Array.Empty<byte>();
            var encrypted = service.Encrypt(plaintext);
            var decrypted = service.Decrypt(encrypted);
            return CollectionsAreEqual(plaintext, decrypted);
        }).QuickCheckThrowOnFailure();
    }

    /// <summary>
    /// Property 17 (edge case): Empty byte array round-trips correctly.
    /// </summary>
    [TestMethod]
    public void Property17_EncryptionRoundTrip_EmptyArray()
    {
        var service = CreateService();

        var encrypted = service.Encrypt(Array.Empty<byte>());
        var decrypted = service.Decrypt(encrypted);

        CollectionAssert.AreEqual(Array.Empty<byte>(), decrypted);
    }

    /// <summary>
    /// AES-GCM uses a random nonce, so two encryptions of the same plaintext must produce different ciphertexts.
    /// </summary>
    [TestMethod]
    public void Property17_TwoEncryptionsSamePlaintext_ProduceDifferentCiphertexts()
    {
        var service = CreateService();

        // Filter to non-empty arrays so the nonce difference is observable in the output
        var arb = ArbMap.Default.ArbFor<byte[]>()
            .Filter(b => b != null && b.Length > 0);

        Prop.ForAll(arb, plaintext =>
        {
            var cipher1 = service.Encrypt(plaintext);
            var cipher2 = service.Encrypt(plaintext);
            // Different random nonces mean the ciphertexts must differ
            return !CollectionsAreEqual(cipher1, cipher2);
        }).QuickCheckThrowOnFailure();
    }

    /// <summary>
    /// Decrypting with a different key must throw (AES-GCM authentication tag mismatch).
    /// </summary>
    [TestMethod]
    public void Property17_DecryptWithWrongKey_ThrowsException()
    {
        var service = CreateService();

        // A different 32-byte key (all 0xFF bytes — guaranteed different from all-zero test key)
        var wrongKeyBytes = new byte[32];
        Array.Fill(wrongKeyBytes, (byte)0xFF);
        var wrongKeyBase64 = Convert.ToBase64String(wrongKeyBytes);
        var wrongKeyService = CreateService(wrongKeyBase64);

        var arb = ArbMap.Default.ArbFor<byte[]>()
            .Filter(b => b != null && b.Length > 0);

        Prop.ForAll(arb, plaintext =>
        {
            var encrypted = service.Encrypt(plaintext);

            try
            {
                wrongKeyService.Decrypt(encrypted);
                return false; // Should have thrown
            }
            catch (AuthenticationTagMismatchException)
            {
                return true; // Expected: wrong key causes tag verification failure
            }
            catch (CryptographicException)
            {
                return true; // Also acceptable: general crypto failure
            }
        }).QuickCheckThrowOnFailure();
    }

    /// <summary>
    /// String round-trip: EncryptString then DecryptString returns the original string.
    /// </summary>
    [TestMethod]
    public void Property17_StringEncryptionRoundTrip()
    {
        var service = CreateService();

        var arb = ArbMap.Default.ArbFor<string>()
            .Filter(s => s != null);

        Prop.ForAll(arb, plaintext =>
        {
            var encrypted = service.EncryptString(plaintext);
            var decrypted = service.DecryptString(encrypted);
            return decrypted == plaintext;
        }).QuickCheckThrowOnFailure();
    }

    private static bool CollectionsAreEqual(byte[] a, byte[] b)
    {
        if (a.Length != b.Length) return false;
        for (var i = 0; i < a.Length; i++)
            if (a[i] != b[i]) return false;
        return true;
    }
}
