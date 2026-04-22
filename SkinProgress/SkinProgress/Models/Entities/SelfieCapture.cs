namespace SkinProgress.Models.Entities;

/// <summary>
/// Represents a day's photo capture session with up to 3 views (front, left, right).
/// Groups related photos together; tracks session completeness (3/3 views = complete).
/// </summary>
public class SelfieCapture
{
    /// <summary>
    /// Primary key for capture session.
    /// </summary>
    public Guid CaptureId { get; set; }

    /// <summary>
    /// Foreign key to User who initiated this capture session.
    /// Used for ownership and query filtering.
    /// </summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// Date of capture (no time component).
    /// Enforced constraint: At most 1 SelfieCapture per (UserId, CaptureDate).
    /// Must not be in future.
    /// </summary>
    public DateTime CaptureDate { get; set; }

    /// <summary>
    /// Session completion status.
    /// Values: "complete" (all 3 views captured), "partial" (fewer than 3 views).
    /// Derived from non-null photo FK counts; Status = "complete" iff all 3 photo FKs are non-null.
    /// </summary>
    public string Status { get; set; } = "partial"; // "complete" or "partial"

    /// <summary>
    /// Foreign key to front-facing photo (frontal selfie angle).
    /// Nullable; may be null if user hasn't yet captured front view.
    /// </summary>
    public Guid? FrontPhotoId { get; set; }

    /// <summary>
    /// Foreign key to left-profile photo.
    /// Nullable; may be null if user hasn't yet captured left view.
    /// </summary>
    public Guid? LeftPhotoId { get; set; }

    /// <summary>
    /// Foreign key to right-profile photo.
    /// Nullable; may be null if user hasn't yet captured right view.
    /// </summary>
    public Guid? RightPhotoId { get; set; }

    /// <summary>
    /// Timestamp when capture session was created (UTC).
    /// Set to start of capture flow (before any photos uploaded).
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Timestamp when capture session was last updated (UTC).
    /// Updated each time a new photo is added to session.
    /// </summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Soft delete timestamp (UTC).
    /// Null means session is active; non-null means marked for deletion.
    /// Hard delete occurs 30 days after this timestamp per retention policy.
    /// Associated photos are also marked deleted (referential integrity).
    /// </summary>
    public DateTime? DeletedAt { get; set; }

    // Navigation properties
    /// <summary>
    /// Navigation property for the User who owns this capture session.
    /// </summary>
    public User? User { get; set; }

    /// <summary>
    /// Navigation property for the front photo (FrontPhotoId FK).
    /// May be null if front view not yet captured.
    /// </summary>
    public Photo? FrontPhoto { get; set; }

    /// <summary>
    /// Navigation property for the left photo (LeftPhotoId FK).
    /// May be null if left view not yet captured.
    /// </summary>
    public Photo? LeftPhoto { get; set; }

    /// <summary>
    /// Navigation property for the right photo (RightPhotoId FK).
    /// May be null if right view not yet captured.
    /// </summary>
    public Photo? RightPhoto { get; set; }
}
