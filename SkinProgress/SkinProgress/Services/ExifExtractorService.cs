using MetadataExtractor;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SkinProgress.Services;

/// <summary>
/// Service for extracting EXIF data from JPEG images.
/// Preserves device model, orientation, timestamp, and other metadata.
/// Returns both human-readable and raw JSON formats.
/// </summary>
public class ExifExtractorService
{
    private readonly ILogger<ExifExtractorService> _logger;

    public ExifExtractorService(ILogger<ExifExtractorService> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Extracts EXIF metadata from JPEG image data.
    /// Focuses on device model, capture timestamp, and orientation.
    /// Returns structured data for database storage.
    /// </summary>
    /// <param name="imageData">Raw JPEG image bytes</param>
    /// <returns>Extracted EXIF data in structured format</returns>
    public ExifData ExtractExif(byte[] imageData)
    {
        if (imageData == null || imageData.Length == 0)
            throw new ArgumentNullException(nameof(imageData), "Image data cannot be null or empty");

        var result = new ExifData
        {
            CaptureTimestamp = DateTime.UtcNow, // Default to now if not in EXIF
            Orientation = "normal"
        };

        try
        {
            var directories = ImageMetadataReader.ReadMetadata(new MemoryStream(imageData));

            // Store raw EXIF for audit trail
            var rawExifDict = new Dictionary<string, string>();

            foreach (var directory in directories)
            {
                _logger.LogDebug("Found metadata directory: {name}", directory.Name);

                // Extract from IFD0 (main image) and ExifIFD directories
                if (directory.Name.Contains("Exif IFD0") || directory.Name.Contains("Exif SubIFD"))
                {
                    foreach (var tag in directory.Tags)
                    {
                        rawExifDict[$"{directory.Name}_{tag.Name}"] = tag.Description ?? "null";

                        // Extract specific tags we care about
                        switch (tag.Name)
                        {
                            case "Model":
                                result.DeviceModel = tag.Description;
                                break;
                            case "Orientation":
                                result.Orientation = NormalizeOrientationTag(tag.Description);
                                break;
                            case "DateTime":
                            case "Date/Time":
                            case "DateTime Original":
                                if (DateTime.TryParse(tag.Description, out var exifDateTime))
                                {
                                    result.CaptureTimestamp = DateTime.SpecifyKind(exifDateTime, DateTimeKind.Utc);
                                }
                                break;
                            case "Make":
                                if (string.IsNullOrWhiteSpace(result.DeviceModel))
                                {
                                    result.DeviceModel = tag.Description;
                                }
                                else
                                {
                                    // Combine Make and Model for clarity
                                    result.DeviceModel = $"{tag.Description} {result.DeviceModel}".Trim();
                                }
                                break;
                        }
                    }
                }
            }

            // Store raw EXIF as JSON
            result.ExifRaw = JsonSerializer.Serialize(rawExifDict, new JsonSerializerOptions
            {
                WriteIndented = false,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
            });

            _logger.LogInformation(
                "EXIF extracted: Device={device}, Orientation={orientation}, Timestamp={timestamp}",
                result.DeviceModel ?? "unknown", result.Orientation, result.CaptureTimestamp);

            return result;
        }
        catch (SixLabors.ImageSharp.ImageProcessingException ex)
        {
            _logger.LogWarning(ex, "Could not extract EXIF from image (not a standard JPEG or no EXIF data)");
            // Return with defaults if EXIF extraction fails; EXIF is optional
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "EXIF extraction failed with unexpected error");
            // Return with defaults on failure; EXIF extraction is best-effort
            return result;
        }
    }

    /// <summary>
    /// Normalizes EXIF orientation tag values to user-friendly names.
    /// EXIF Orientation values (1-8) converted to rotation descriptions.
    /// </summary>
    private string NormalizeOrientationTag(string? exifOrientation)
    {
        if (string.IsNullOrWhiteSpace(exifOrientation))
            return "normal";

        return exifOrientation.ToLowerInvariant() switch
        {
            "1" or "normal" => "normal",
            "2" or "flip horizontal" => "flip_h",
            "3" or "rotate 180" => "rotated_180",
            "4" or "flip vertical" => "flip_v",
            "5" or "transpose" or "rotate 90 cw then flip horizontal" => "rotated_90_ccw",
            "6" or "rotate 90" or "rotate 90 cw" => "rotated_90_cw",
            "7" or "transverse" or "rotate 90 ccw then flip horizontal" => "rotated_90_ccw_alt",
            "8" or "rotate 270" or "rotate 270 cw" => "rotated_270_cw",
            _ => "normal"
        };
    }
}

/// <summary>
/// Structured EXIF data extracted from image.
/// </summary>
public class ExifData
{
    /// <summary>
    /// Original capture timestamp from EXIF DateTime tags.
    /// Falls back to current UTC time if not available.
    /// </summary>
    public DateTime CaptureTimestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Device model extracted from EXIF Make/Model tags.
    /// Example: "iPhone 14 Pro", "SM-G990B" (Samsung Galaxy S21)
    /// </summary>
    public string? DeviceModel { get; set; }

    /// <summary>
    /// Image orientation from EXIF Orientation tag (values 1-8).
    /// Normalized to: normal, rotated_90_cw, rotated_180, rotated_270_cw, flip_h, flip_v
    /// </summary>
    public string Orientation { get; set; } = "normal";

    /// <summary>
    /// Raw EXIF metadata as JSON string for audit trail.
    /// Contains all extracted EXIF tags and values.
    /// </summary>
    public string? ExifRaw { get; set; }
}
