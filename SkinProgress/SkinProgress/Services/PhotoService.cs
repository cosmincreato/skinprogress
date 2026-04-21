using Microsoft.EntityFrameworkCore;
using SkinProgress.Data;
using SkinProgress.Models.DTOs;
using SkinProgress.Models.Entities;

namespace SkinProgress.Services;

/// <summary>
/// Core service for photo upload, retrieval, deletion, and session management.
/// Orchestrates compression, EXIF extraction, quota management, and database operations.
/// Implements soft-delete strategy with 30-day retention policy.
/// </summary>
public class PhotoService
{
    private readonly AppDbContext _db;
    private readonly ImageCompressionService _compressionService;
    private readonly ExifExtractorService _exifService;
    private readonly StorageQuotaService _quotaService;
    private readonly ILogger<PhotoService> _logger;

    // Storage paths
    private const string PhotoStorageRoot = "photos"; // Relative to wwwroot
    private const int MaxPhotoSizeBytes = 2_097_152; // 2MB

    public PhotoService(
        AppDbContext db,
        ImageCompressionService compressionService,
        ExifExtractorService exifService,
        StorageQuotaService quotaService,
        ILogger<PhotoService> logger)
    {
        _db = db ?? throw new ArgumentNullException(nameof(db));
        _compressionService = compressionService ?? throw new ArgumentNullException(nameof(compressionService));
        _exifService = exifService ?? throw new ArgumentNullException(nameof(exifService));
        _quotaService = quotaService ?? throw new ArgumentNullException(nameof(quotaService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Uploads a selfie photo: validates, compresses, extracts EXIF, stores, updates quota.
    /// Creates or updates SelfieCapture session.
    /// Implements soft-delete strategy.
    /// </summary>
    /// <param name="userId">User ID uploading the photo</param>
    /// <param name="request">Upload request with image data and metadata</param>
    /// <returns>Upload response with photo ID and session status</returns>
    public async Task<PhotoUploadResponseDto> UploadPhotoAsync(Guid userId, PhotoUploadRequestDto request)
    {
        if (userId == Guid.Empty)
            throw new ArgumentException("Invalid user ID", nameof(userId));

        if (request == null)
            throw new ArgumentNullException(nameof(request));

        ValidateUploadRequest(request);

        // Get user
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            throw new ArgumentException($"User {userId} not found", nameof(userId));

        // Decode image data from base64
        byte[] imageData;
        try
        {
            imageData = Convert.FromBase64String(request.ImageDataBase64);
        }
        catch (FormatException ex)
        {
            throw new InvalidOperationException("Invalid base64 image data", ex);
        }

        // Check initial file size
        if (imageData.Length > MaxPhotoSizeBytes)
            throw new InvalidOperationException($"Image exceeds maximum size of {MaxPhotoSizeBytes} bytes");

        // Check storage quota before compression
        if (!await _quotaService.CheckQuotaAsync(userId, imageData.Length))
            throw new InvalidOperationException("Storage quota exceeded");

        // Compress image
        var compressionResult = await _compressionService.CompressJpegAsync(imageData);
        if (compressionResult.CompressedData == null || compressionResult.CompressedData.Length == 0)
            throw new InvalidOperationException("Image compression produced no data");

        // Final size check
        if (compressionResult.CompressedSize > MaxPhotoSizeBytes)
            throw new InvalidOperationException(
                $"Compressed image ({compressionResult.CompressedSize} bytes) exceeds maximum size of {MaxPhotoSizeBytes} bytes");

        // Extract EXIF
        var exifData = _exifService.ExtractExif(compressionResult.CompressedData);

        // Parse and validate capture date
        if (!DateTime.TryParse(request.CaptureDate, out var captureDate))
            captureDate = DateTime.UtcNow.Date;

        // Ensure capture date is not in future
        if (captureDate.Date > DateTime.UtcNow.Date)
            captureDate = DateTime.UtcNow.Date;

        // Create PhotoMetadata
        var metadata = new PhotoMetadata
        {
            MetadataId = Guid.NewGuid(),
            CaptureTimestamp = exifData.CaptureTimestamp,
            DeviceModel = exifData.DeviceModel ?? request.DeviceModel,
            Orientation = exifData.Orientation,
            Brightness = request.Brightness > 0 ? request.Brightness : compressionResult.Brightness,
            FaceDetectionConfidence = request.FaceDetectionConfidence,
            FaceCount = request.FaceCount > 0 ? request.FaceCount : 1,
            CompressionQuality = compressionResult.Quality,
            CompressionRatio = compressionResult.CompressionRatio,
            ExifRaw = exifData.ExifRaw,
            CreatedAt = DateTime.UtcNow
        };

        // Create Photo
        var filePath = GenerateFilePath(userId, captureDate);
        var photo = new Photo
        {
            PhotoId = Guid.NewGuid(),
            UserId = userId,
            ViewType = request.ViewType.ToLower(),
            CaptureDate = captureDate,
            FilePath = filePath,
            FileSize = compressionResult.CompressedSize,
            MetadataId = metadata.MetadataId,
            Metadata = metadata,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        // Get or create SelfieCapture session
        var session = await _db.SelfieCaptures.FirstOrDefaultAsync(s =>
            s.UserId == userId && s.CaptureDate == captureDate && s.DeletedAt == null);

        if (session == null)
        {
            session = new SelfieCapture
            {
                CaptureId = Guid.NewGuid(),
                UserId = userId,
                CaptureDate = captureDate,
                Status = "partial",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.SelfieCaptures.Add(session);
        }

        // Update session with the photo
        photo.SelfieCaptures_CaptureId = session.CaptureId;
        switch (photo.ViewType)
        {
            case "front":
                session.FrontPhotoId = photo.PhotoId;
                session.FrontPhoto = photo;
                break;
            case "left":
                session.LeftPhotoId = photo.PhotoId;
                session.LeftPhoto = photo;
                break;
            case "right":
                session.RightPhotoId = photo.PhotoId;
                session.RightPhoto = photo;
                break;
        }

        // Check if session is now complete
        if (session.FrontPhotoId.HasValue && session.LeftPhotoId.HasValue && session.RightPhotoId.HasValue)
            session.Status = "complete";

        session.UpdatedAt = DateTime.UtcNow;

        // Save to database
        _db.Photos.Add(photo);
        await _db.SaveChangesAsync();

        // Update storage quota
        await _quotaService.UpdateQuotaAsync(userId, compressionResult.CompressedSize, isUpload: true);

        // Save file to storage (in production, this would be async and cloud-based)
        // For MVP, we'll store in wwwroot
        await SavePhotoFileAsync(filePath, compressionResult.CompressedData!);

        _logger.LogInformation(
            "Photo uploaded: {photoId} by user {userId}, view={view}, size={size} bytes, session={sessionId}",
            photo.PhotoId, userId, photo.ViewType, compressionResult.CompressedSize, session.CaptureId);

        return new PhotoUploadResponseDto
        {
            PhotoId = photo.PhotoId,
            CaptureSessionId = session.CaptureId,
            CaptureDate = photo.CaptureDate,
            ViewType = photo.ViewType,
            FilePath = photo.FilePath,
            FileSize = photo.FileSize,
            CompressionResult = new CompressionResultDto
            {
                OriginalSize = compressionResult.OriginalSize,
                CompressedSize = compressionResult.CompressedSize,
                CompressionRatio = compressionResult.CompressionRatio,
                Quality = compressionResult.Quality,
                Brightness = compressionResult.Brightness
            },
            SessionStatus = session.Status,
            StorageQuota = await _quotaService.GetQuotaAsync(userId),
            UploadedAt = photo.CreatedAt
        };
    }

    /// <summary>
    /// Retrieves photo history for a user with optional date range filtering.
    /// Returns sessions grouped by date with photos organized by view type.
    /// </summary>
    public async Task<PhotoHistoryResponseDto> GetPhotoHistoryAsync(Guid userId, int days = 30)
    {
        var startDate = DateTime.UtcNow.AddDays(-days);

        var sessions = await _db.SelfieCaptures
            .Where(s => s.UserId == userId && s.DeletedAt == null && s.CaptureDate >= startDate)
            .OrderByDescending(s => s.CaptureDate)
            .ToListAsync();

        var result = new PhotoHistoryResponseDto
        {
            CompleteSessions = sessions.Count(s => s.Status == "complete")
        };

        foreach (var session in sessions)
        {
            var sessionDto = new CaptureSessionDto
            {
                CaptureSessionId = session.CaptureId,
                CaptureDate = session.CaptureDate,
                Status = session.Status
            };

            var confidences = new List<decimal>();

            // Add photos to session
            if (session.FrontPhotoId.HasValue)
            {
                var photo = await GetPhotoHistoryItemAsync(session.FrontPhotoId.Value, "front");
                if (photo != null)
                {
                    sessionDto.PhotosByView["front"] = photo;
                    confidences.Add(photo.FaceDetectionConfidence);
                }
            }

            if (session.LeftPhotoId.HasValue)
            {
                var photo = await GetPhotoHistoryItemAsync(session.LeftPhotoId.Value, "left");
                if (photo != null)
                {
                    sessionDto.PhotosByView["left"] = photo;
                    confidences.Add(photo.FaceDetectionConfidence);
                }
            }

            if (session.RightPhotoId.HasValue)
            {
                var photo = await GetPhotoHistoryItemAsync(session.RightPhotoId.Value, "right");
                if (photo != null)
                {
                    sessionDto.PhotosByView["right"] = photo;
                    confidences.Add(photo.FaceDetectionConfidence);
                }
            }

            if (confidences.Count > 0)
                sessionDto.AverageFaceConfidence = Math.Round(confidences.Average(), 3);

            result.Sessions.Add(sessionDto);
        }

        result.TotalPhotoCount = await _db.Photos
            .Where(p => p.UserId == userId && p.DeletedAt == null)
            .CountAsync();

        result.StorageQuota = await _quotaService.GetQuotaAsync(userId);

        return result;
    }

    /// <summary>
    /// Deletes a photo (soft delete with 30-day retention).
    /// Updates storage quota.
    /// </summary>
    public async Task DeletePhotoAsync(Guid userId, Guid photoId)
    {
        var photo = await _db.Photos
            .Include(p => p.Metadata)
            .FirstOrDefaultAsync(p => p.PhotoId == photoId && p.UserId == userId && p.DeletedAt == null);

        if (photo == null)
            throw new InvalidOperationException("Photo not found or already deleted");

        photo.DeletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Update quota (subtract file size)
        await _quotaService.UpdateQuotaAsync(userId, photo.FileSize, isUpload: false);

        _logger.LogInformation("Photo soft-deleted: {photoId} by user {userId}", photoId, userId);
    }

    /// <summary>
    /// Validates upload request before processing.
    /// </summary>
    private void ValidateUploadRequest(PhotoUploadRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.ImageDataBase64))
            throw new ArgumentException("Image data is required", nameof(request.ImageDataBase64));

        if (string.IsNullOrWhiteSpace(request.ViewType))
            throw new ArgumentException("View type is required", nameof(request.ViewType));

        var validViewTypes = new[] { "front", "left", "right" };
        if (!validViewTypes.Contains(request.ViewType.ToLower()))
            throw new ArgumentException("Invalid view type. Must be front, left, or right", nameof(request.ViewType));

        if (request.FaceDetectionConfidence < 0 || request.FaceDetectionConfidence > 1)
            throw new ArgumentException("Face detection confidence must be between 0 and 1", nameof(request.FaceDetectionConfidence));

        if (request.FaceCount < 1)
            throw new ArgumentException("At least one face must be detected", nameof(request.FaceCount));
    }

    /// <summary>
    /// Generates file path for photo storage.
    /// Format: /photos/{userId}/{YYYY-MM-DD}/{photoId}.jpg
    /// </summary>
    private string GenerateFilePath(Guid userId, DateTime captureDate)
    {
        var photoId = Guid.NewGuid();
        return $"/{PhotoStorageRoot}/{userId:N}/{captureDate:yyyy-MM-dd}/{photoId:N}.jpg";
    }

    /// <summary>
    /// Gets a photo as PhotoHistoryItemDto.
    /// </summary>
    private async Task<PhotoHistoryItemDto?> GetPhotoHistoryItemAsync(Guid photoId, string viewType)
    {
        var photo = await _db.Photos
            .Include(p => p.Metadata)
            .FirstOrDefaultAsync(p => p.PhotoId == photoId && p.DeletedAt == null);

        if (photo?.Metadata == null)
            return null;

        return new PhotoHistoryItemDto
        {
            PhotoId = photo.PhotoId,
            CaptureSessionId = photo.SelfieCaptures_CaptureId ?? Guid.Empty,
            CaptureDate = photo.CaptureDate,
            ViewType = viewType,
            ThumbnailUrl = $"/api/photos/{photo.PhotoId}/thumbnail",
            FullUrl = $"/api/photos/{photo.PhotoId}",
            FaceDetectionConfidence = photo.Metadata.FaceDetectionConfidence,
            Brightness = photo.Metadata.Brightness,
            UploadedAt = photo.CreatedAt
        };
    }

    /// <summary>
    /// Saves photo file to storage.
    /// MVP: Saves to wwwroot/photos/
    /// Production: Would save to Azure Blob Storage or similar
    /// </summary>
    private async Task SavePhotoFileAsync(string relativePath, byte[] fileData)
    {
        try
        {
            // For MVP, save to wwwroot
            // In production, this would be replaced with cloud storage
            var fullPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", relativePath.TrimStart('/'));
            var directory = Path.GetDirectoryName(fullPath)!;

            if (!Directory.Exists(directory))
                Directory.CreateDirectory(directory);

            await File.WriteAllBytesAsync(fullPath, fileData);
            _logger.LogDebug("Photo saved to {path}", fullPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save photo file to {path}", relativePath);
            throw;
        }
    }
}
