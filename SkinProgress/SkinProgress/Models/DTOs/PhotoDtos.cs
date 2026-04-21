namespace SkinProgress.Models.DTOs;

/// <summary>
/// Request DTO for uploading a selfie photo.
/// Contains the image data in base64, metadata from the device, and face detection results.
/// </summary>
public class PhotoUploadRequestDto
{
    /// <summary>
    /// Base64-encoded JPEG image data.
    /// Maximum: 2MB uncompressed (checked by API before processing).
    /// </summary>
    public string ImageDataBase64 { get; set; } = string.Empty;

    /// <summary>
    /// Camera view type for this photo.
    /// Required values: "front", "left", "right".
    /// </summary>
    public string ViewType { get; set; } = string.Empty;

    /// <summary>
    /// Date of capture (no time component).
    /// Format: "yyyy-MM-dd"
    /// Used to group photos into daily capture sessions.
    /// </summary>
    public string CaptureDate { get; set; } = string.Empty;

    /// <summary>
    /// Face detection confidence score from client-side face-api.js.
    /// Range: 0.0 to 1.0
    /// Minimum acceptable: 0.95 per specification.
    /// </summary>
    public decimal FaceDetectionConfidence { get; set; }

    /// <summary>
    /// Number of faces detected in the image.
    /// Should be 1 for single-face selfie requirement.
    /// </summary>
    public int FaceCount { get; set; }

    /// <summary>
    /// Device name/model extracted from EXIF (if available).
    /// Example: "iPhone 14 Pro", "Samsung Galaxy S23"
    /// </summary>
    public string? DeviceModel { get; set; }

    /// <summary>
    /// Image orientation from EXIF Orientation tag.
    /// Example: "normal", "rotated_90_cw"
    /// </summary>
    public string? Orientation { get; set; }

    /// <summary>
    /// Estimated image brightness as percentage (0-100).
    /// Pre-calculated by compression service.
    /// </summary>
    public decimal Brightness { get; set; }

    /// <summary>
    /// Full EXIF data as JSON string for audit trail.
    /// Extracted and preserved by ExifExtractorService.
    /// </summary>
    public string? ExifRaw { get; set; }
}

/// <summary>
/// Response DTO after successful photo upload.
/// Contains the created photo record and metadata.
/// </summary>
public class PhotoUploadResponseDto
{
    /// <summary>
    /// Unique identifier for the uploaded photo.
    /// </summary>
    public Guid PhotoId { get; set; }

    /// <summary>
    /// The parent SelfieCapture session ID (if created/updated).
    /// Null if this is an orphaned photo.
    /// </summary>
    public Guid? CaptureSessionId { get; set; }

    /// <summary>
    /// Capture date for this photo.
    /// </summary>
    public DateTime CaptureDate { get; set; }

    /// <summary>
    /// Camera view type that was uploaded.
    /// </summary>
    public string ViewType { get; set; } = string.Empty;

    /// <summary>
    /// File path where photo was stored.
    /// Example: /photos/{userId}/{date}/{photoId}.jpg
    /// </summary>
    public string FilePath { get; set; } = string.Empty;

    /// <summary>
    /// File size in bytes after compression.
    /// Maximum: 2,097,152 bytes (2 MB).
    /// </summary>
    public long FileSize { get; set; }

    /// <summary>
    /// Result of compression operation.
    /// </summary>
    public CompressionResultDto CompressionResult { get; set; } = new();

    /// <summary>
    /// Current capture session status after upload.
    /// Values: "complete" (3/3 views), "partial" (fewer views).
    /// </summary>
    public string SessionStatus { get; set; } = "partial";

    /// <summary>
    /// Updated storage quota information after upload.
    /// </summary>
    public StorageQuotaDto StorageQuota { get; set; } = new();

    /// <summary>
    /// Timestamp when photo was uploaded to server.
    /// </summary>
    public DateTime UploadedAt { get; set; }
}

/// <summary>
/// DTO for compression operation metrics.
/// </summary>
public class CompressionResultDto
{
    /// <summary>
    /// Original file size before compression.
    /// </summary>
    public long OriginalSize { get; set; }

    /// <summary>
    /// Final compressed file size.
    /// </summary>
    public long CompressedSize { get; set; }

    /// <summary>
    /// Compression ratio as decimal (original / compressed).
    /// Example: 3.5 means original was 3.5x larger.
    /// </summary>
    public decimal CompressionRatio { get; set; }

    /// <summary>
    /// JPEG quality used for compression (0-100).
    /// Default: 85%.
    /// </summary>
    public int Quality { get; set; } = 85;

    /// <summary>
    /// Estimated brightness of the image (0-100%).
    /// Used for lighting quality assessment.
    /// </summary>
    public decimal Brightness { get; set; }
}

/// <summary>
/// DTO for photo history retrieval.
/// Represents a single photo in the history list.
/// </summary>
public class PhotoHistoryItemDto
{
    /// <summary>
    /// Photo unique identifier.
    /// </summary>
    public Guid PhotoId { get; set; }

    /// <summary>
    /// The parent SelfieCapture session ID.
    /// </summary>
    public Guid CaptureSessionId { get; set; }

    /// <summary>
    /// Date of photo capture.
    /// </summary>
    public DateTime CaptureDate { get; set; }

    /// <summary>
    /// View type of this photo (front, left, right).
    /// </summary>
    public string ViewType { get; set; } = string.Empty;

    /// <summary>
    /// URL to access the photo thumbnail.
    /// Example: /api/photos/{photoId}/thumbnail
    /// </summary>
    public string ThumbnailUrl { get; set; } = string.Empty;

    /// <summary>
    /// URL to access the full-resolution photo.
    /// Example: /api/photos/{photoId}
    /// </summary>
    public string FullUrl { get; set; } = string.Empty;

    /// <summary>
    /// Face detection confidence for this photo.
    /// </summary>
    public decimal FaceDetectionConfidence { get; set; }

    /// <summary>
    /// Brightness of the image (0-100%).
    /// </summary>
    public decimal Brightness { get; set; }

    /// <summary>
    /// Timestamp when photo was uploaded.
    /// </summary>
    public DateTime UploadedAt { get; set; }
}

/// <summary>
/// Response DTO for photo history queries.
/// </summary>
public class PhotoHistoryResponseDto
{
    /// <summary>
    /// List of capture sessions with their associated photos.
    /// </summary>
    public List<CaptureSessionDto> Sessions { get; set; } = new();

    /// <summary>
    /// Total number of photos in user's history.
    /// </summary>
    public int TotalPhotoCount { get; set; }

    /// <summary>
    /// Total number of complete capture sessions (3/3 views).
    /// </summary>
    public int CompleteSessions { get; set; }

    /// <summary>
    /// Current user's storage quota information.
    /// </summary>
    public StorageQuotaDto StorageQuota { get; set; } = new();
}

/// <summary>
/// DTO for a single capture session in history.
/// </summary>
public class CaptureSessionDto
{
    /// <summary>
    /// Session unique identifier.
    /// </summary>
    public Guid CaptureSessionId { get; set; }

    /// <summary>
    /// Date of the capture session.
    /// </summary>
    public DateTime CaptureDate { get; set; }

    /// <summary>
    /// Session status: "complete" (3/3 views) or "partial".
    /// </summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>
    /// Photos in this session, organized by view type.
    /// </summary>
    public Dictionary<string, PhotoHistoryItemDto> PhotosByView { get; set; } = new();

    /// <summary>
    /// Average face detection confidence across all photos in session.
    /// </summary>
    public decimal AverageFaceConfidence { get; set; }
}

/// <summary>
/// DTO for storage quota information.
/// </summary>
public class StorageQuotaDto
{
    /// <summary>
    /// Standard storage quota in bytes.
    /// Default: 5GB (5,368,709,120 bytes).
    /// </summary>
    public long StandardQuota { get; set; }

    /// <summary>
    /// Current storage used in bytes.
    /// </summary>
    public long UsedStorage { get; set; }

    /// <summary>
    /// Available storage remaining in bytes.
    /// </summary>
    public long RemainingStorage { get; set; }

    /// <summary>
    /// Percentage of quota used (0-100).
    /// </summary>
    public decimal PercentageUsed { get; set; }

    /// <summary>
    /// Human-readable formatted quota information.
    /// Example: "512 MB / 5 GB"
    /// </summary>
    public string FormattedQuota { get; set; } = string.Empty;
}
