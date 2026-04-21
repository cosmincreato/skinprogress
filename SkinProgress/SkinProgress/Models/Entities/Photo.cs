namespace SkinProgress.Models.Entities;

/// <summary>
/// Represents a single captured selfie image (front, left, or right view).
/// Part of a SelfieCapture session; includes file metadata and compression info.
/// </summary>
public class Photo
{
    /// <summary>
    /// Primary key for photo record.
    /// </summary>
    public Guid PhotoId { get; set; }

    /// <summary>
    /// Foreign key to User who captured this photo.
    /// Used for ownership validation and storage quota tracking.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Foreign key to parent SelfieCapture session (nullable if orphaned).
    /// Allows grouping front, left, right photos together.
    /// </summary>
    public Guid? SelfieCaptures_CaptureId { get; set; }

    /// <summary>
    /// Camera angle/view type for this photo.
    /// Enum values: "front" (selfie), "left" (profile), "right" (profile).
    /// Used to validate multi-view capture completeness.
    /// </summary>
    public string ViewType { get; set; } = string.Empty; // "front", "left", or "right"

    /// <summary>
    /// Date of capture (no time component).
    /// Used for grouping photos by day and enforcing one-daily constraint.
    /// Must not be in future; typically matches SelfieCapture.CaptureDate.
    /// </summary>
    public DateTime CaptureDate { get; set; }

    /// <summary>
    /// Relative file path on disk.
    /// Format: /photos/{UserId}/{CaptureDate:yyyy-MM-dd}/{PhotoId}.jpg
    /// Example: /photos/550e8400-e29b-41d4-a716-446655440000/2026-04-04/123e4567-e89b-12d3-a456/jpg
    /// Must be unique per user per day.
    /// </summary>
    public string FilePath { get; set; } = string.Empty;

    /// <summary>
    /// File size in bytes.
    /// Maximum: 2,097,152 bytes (2 MB) per compression spec.
    /// Used for storage quota enforcement.
    /// </summary>
    public long FileSize { get; set; }

    /// <summary>
    /// Foreign key to PhotoMetadata entity (1:1 required relationship).
    /// Contains EXIF, detection results, and compression metrics.
    /// </summary>
    public Guid MetadataId { get; set; }

    /// <summary>
    /// Timestamp when photo was uploaded to server (UTC).
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Timestamp when photo record was last updated (UTC).
    /// e.g., when re-compressed or metadata refreshed.
    /// </summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Soft delete timestamp (UTC).
    /// Null means photo is active; non-null means marked for deletion.
    /// Hard delete occurs 30 days after this timestamp per retention policy.
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    // Navigation properties
    /// <summary>
    /// Navigation property for the User who owns this photo.
    /// </summary>
    public User? User { get; set; }

    /// <summary>
    /// Navigation property for parent SelfieCapture session.
    /// Null if photo is orphaned (not part of any session).
    /// </summary>
    public SelfieCapture? SelfieCapture { get; set; }

    /// <summary>
    /// Navigation property for associated PhotoMetadata (1:1).
    /// Required; always populated after upload.
    /// </summary>
    public PhotoMetadata? Metadata { get; set; }
}
