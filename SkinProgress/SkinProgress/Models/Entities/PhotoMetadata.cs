namespace SkinProgress.Models.Entities;

/// <summary>
/// Represents EXIF, face detection metrics, and compression data for a photo.
/// One-to-one with Photo entity.
/// </summary>
public class PhotoMetadata
{
    /// <summary>
    /// Primary key for metadata record.
    /// </summary>
    public Guid MetadataId { get; set; }

    /// <summary>
    /// Foreign key to Photo entity (1:1 relationship).
    /// </summary>
    public Guid PhotoId { get; set; }

    /// <summary>
    /// Original EXIF DateTime from the device camera.
    /// May differ from Photo.CreatedAt if system clock is incorrect.
    /// </summary>
    public DateTime CaptureTimestamp { get; set; }

    /// <summary>
    /// EXIF Make/Model string (e.g., "iPhone 14 Pro", "Samsung Galaxy S23").
    /// Nullable as some photos may not include EXIF data.
    /// </summary>
    public string? DeviceModel { get; set; }

    /// <summary>
    /// EXIF Orientation tag normalized to user-facing format.
    /// Values: "normal", "rotated_90_cw", "rotated_180", "rotated_90_ccw", etc.
    /// Default is "normal" (0°).
    /// </summary>
    public string Orientation { get; set; } = "normal";

    /// <summary>
    /// Estimated image brightness as percentage (0-100).
    /// Calculated from histogram analysis during compression.
    /// Used for lighting quality assessment.
    /// </summary>
    public decimal Brightness { get; set; }

    /// <summary>
    /// Confidence score from face-api.js face detection (0.0 to 1.0).
    /// Higher value = higher confidence that a face was detected.
    /// Minimum acceptable: 0.95 per spec.
    /// </summary>
    public decimal FaceDetectionConfidence { get; set; }

    /// <summary>
    /// Number of faces detected in the image.
    /// Validation: Must be >= 1 (single-face selfie requirement).
    /// </summary>
    public int FaceCount { get; set; }

    /// <summary>
    /// JPEG quality setting used during compression (0-100).
    /// Default is 85% per research phase decision.
    /// Lower values = higher compression, visible artifacts.
    /// </summary>
    public int CompressionQuality { get; set; } = 85;

    /// <summary>
    /// Compression ratio as decimal (e.g., 3.5 means original was 3.5x larger).
    /// Nullable as not all images require compression tracking.
    /// </summary>
    public decimal? CompressionRatio { get; set; }

    /// <summary>
    /// Full EXIF data as JSON string for audit trail and future analysis.
    /// Nullable as not all source images contain rich EXIF data.
    /// </summary>
    public string? ExifRaw { get; set; }

    /// <summary>
    /// Timestamp when metadata record was created (UTC).
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    /// <summary>
    /// Navigation property for the associated Photo entity.
    /// </summary>
    public Photo? Photo { get; set; }
}
