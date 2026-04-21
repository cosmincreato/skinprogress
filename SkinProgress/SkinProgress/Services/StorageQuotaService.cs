using Microsoft.EntityFrameworkCore;
using SkinProgress.Data;
using SkinProgress.Models.DTOs;
using SkinProgress.Models.Entities;

namespace SkinProgress.Services;

/// <summary>
/// Service for managing user storage quotas.
/// Handles quota validation before uploads and quota tracking after uploads.
/// Enforces 5GB default quota with upgrade paths.
/// </summary>
public class StorageQuotaService
{
    private readonly AppDbContext _db;
    private readonly ILogger<StorageQuotaService> _logger;

    // Default storage quota: 5GB (5,368,709,120 bytes)
    private const long DefaultQuotaBytes = 5_368_709_120L;

    public StorageQuotaService(AppDbContext db, ILogger<StorageQuotaService> logger)
    {
        _db = db ?? throw new ArgumentNullException(nameof(db));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Checks if user has enough storage quota for upload.
    /// Verifies that: CurrentStorageUsed + fileSize ≤ StandardStorageQuota
    /// </summary>
    /// <param name="userId">User ID to check quota for</param>
    /// <param name="fileSizeBytes">Size of file to upload in bytes</param>
    /// <returns>True if user has sufficient quota; false otherwise</returns>
    public async Task<bool> CheckQuotaAsync(Guid userId, long fileSizeBytes)
    {
        if (userId == Guid.Empty)
            throw new ArgumentException("Invalid user ID", nameof(userId));

        if (fileSizeBytes <= 0)
            throw new ArgumentException("File size must be positive", nameof(fileSizeBytes));

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            _logger.LogWarning("User {userId} not found for quota check", userId);
            return false;
        }

        bool hasQuota = user.CurrentStorageUsed + fileSizeBytes <= user.StandardStorageQuota;

        _logger.LogInformation(
            "Quota check for user {userId}: {used} + {new} <= {quota} = {result}",
            userId, user.CurrentStorageUsed, fileSizeBytes, user.StandardStorageQuota, hasQuota);

        return hasQuota;
    }

    /// <summary>
    /// Updates user storage quota after file operation (upload or deletion).
    /// </summary>
    /// <param name="userId">User ID to update quota for</param>
    /// <param name="fileSizeBytes">Size of file in bytes</param>
    /// <param name="isUpload">True for upload (add to quota); false for deletion (subtract)</param>
    /// <returns>Updated storage quota information</returns>
    /// <exception cref="ArgumentException">If user not found or quota would go negative</exception>
    public async Task<StorageQuotaDto> UpdateQuotaAsync(Guid userId, long fileSizeBytes, bool isUpload)
    {
        if (userId == Guid.Empty)
            throw new ArgumentException("Invalid user ID", nameof(userId));

        if (fileSizeBytes < 0)
            throw new ArgumentException("File size cannot be negative", nameof(fileSizeBytes));

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            throw new ArgumentException($"User {userId} not found", nameof(userId));

        long newStorageUsed;
        if (isUpload)
        {
            newStorageUsed = user.CurrentStorageUsed + fileSizeBytes;
            if (newStorageUsed > user.StandardStorageQuota)
            {
                _logger.LogError(
                    "Upload would exceed quota for user {userId}: {current} + {file} > {quota}",
                    userId, user.CurrentStorageUsed, fileSizeBytes, user.StandardStorageQuota);
                throw new InvalidOperationException("Storage quota exceeded");
            }
        }
        else // Deletion
        {
            newStorageUsed = Math.Max(0, user.CurrentStorageUsed - fileSizeBytes);
        }

        user.CurrentStorageUsed = newStorageUsed;
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Quota updated for user {userId}: operation={operation}, fileSize={fileSize}, newUsed={newUsed}, quota={quota}",
            userId, isUpload ? "upload" : "delete", fileSizeBytes, newStorageUsed, user.StandardStorageQuota);

        return GetStorageQuotaDto(user);
    }

    /// <summary>
    /// Gets the current storage quota information for a user.
    /// </summary>
    /// <param name="userId">User ID</param>
    /// <returns>Storage quota information DTO</returns>
    public async Task<StorageQuotaDto> GetQuotaAsync(Guid userId)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            throw new ArgumentException($"User {userId} not found", nameof(userId));

        return GetStorageQuotaDto(user);
    }

    /// <summary>
    /// Initializes quota for a new user (sets to default 5GB).
    /// Called during user registration.
    /// </summary>
    /// <param name="user">User entity to initialize quota for</param>
    public void InitializeQuota(User user)
    {
        if (user == null)
            throw new ArgumentNullException(nameof(user));

        user.StandardStorageQuota = DefaultQuotaBytes;
        user.CurrentStorageUsed = 0;

        _logger.LogInformation(
            "Storage quota initialized for user {userId}: {quota} bytes",
            user.Id, user.StandardStorageQuota);
    }

    /// <summary>
    /// Formats storage size to human-readable format (B, KB, MB, GB).
    /// </summary>
    public static string FormatBytes(long bytes)
    {
        if (bytes < 1024)
            return $"{bytes} B";

        if (bytes < 1024 * 1024)
            return $"{bytes / 1024m:F1} KB";

        if (bytes < 1024 * 1024 * 1024)
            return $"{bytes / (1024m * 1024m):F1} MB";

        return $"{bytes / (1024m * 1024m * 1024m):F1} GB";
    }

    /// <summary>
    /// Converts StorageQuotaDto to human-readable summary.
    /// </summary>
    public static string GetQuotaSummary(StorageQuotaDto quota)
    {
        return $"{FormatBytes(quota.UsedStorage)} / {FormatBytes(quota.StandardQuota)} ({quota.PercentageUsed:F1}%)";
    }

    /// <summary>
    /// Helper to convert User entity to StorageQuotaDto.
    /// </summary>
    private static StorageQuotaDto GetStorageQuotaDto(User user)
    {
        long remainingStorage = Math.Max(0, user.StandardStorageQuota - user.CurrentStorageUsed);
        decimal percentageUsed = user.StandardStorageQuota > 0
            ? Math.Round((decimal)(user.CurrentStorageUsed * 100) / user.StandardStorageQuota, 1)
            : 0;

        return new StorageQuotaDto
        {
            StandardQuota = user.StandardStorageQuota,
            UsedStorage = user.CurrentStorageUsed,
            RemainingStorage = remainingStorage,
            PercentageUsed = percentageUsed,
            FormattedQuota = $"{FormatBytes(user.CurrentStorageUsed)} / {FormatBytes(user.StandardStorageQuota)}"
        };
    }
}
