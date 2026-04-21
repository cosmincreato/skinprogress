using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Jpeg;
using System.Diagnostics;

namespace SkinProgress.Services;

/// <summary>
/// Service for compressing JPEG images while preserving EXIF data.
/// Target: <2MB compressed file size at 85% JPEG quality.
/// Implements brightness estimation for lighting quality assessment.
/// </summary>
public class ImageCompressionService
{
    private readonly ILogger<ImageCompressionService> _logger;

    // Constants for compression strategy
    private const int MaxFileSizeBytes = 2_097_152; // 2 MB
    private const int DefaultQuality = 85;
    private const int MinimumQuality = 60; // Fall-back if default too large
    private const int MaximumQuality = 95; // Don't go too low

    public ImageCompressionService(ILogger<ImageCompressionService> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Compresses a JPEG image to meet file size requirements.
    /// Automatically adjusts JPEG quality if needed to stay under 2MB.
    /// Estimates image brightness during processing.
    /// </summary>
    /// <param name="imageData">Raw image bytes (JPEG recommended)</param>
    /// <param name="desiredQuality">Target JPEG quality (0-100); default 85%</param>
    /// <returns>Compressed image data with compression metrics</returns>
    /// <exception cref="ArgumentNullException">If imageData is null</exception>
    /// <exception cref="InvalidOperationException">If image cannot be processed</exception>
    public async Task<ImageCompressionResult> CompressJpegAsync(
        byte[] imageData,
        int desiredQuality = DefaultQuality)
    {
        if (imageData == null || imageData.Length == 0)
            throw new ArgumentNullException(nameof(imageData), "Image data cannot be null or empty");

        if (desiredQuality < 0 || desiredQuality > 100)
            throw new ArgumentOutOfRangeException(nameof(desiredQuality), "Quality must be between 0 and 100");

        var stopwatch = Stopwatch.StartNew();
        long originalSize = imageData.Length;

        try
        {
            using (var stream = new MemoryStream(imageData))
            {
                using (var image = await Image.LoadAsync<Rgba32>(stream))
                {
                    // Estimate brightness during processing
                    var brightness = EstimateBrightness(image);

                    // Compress to target quality
                    byte[] compressedData = await CompressToQualityAsync(image, desiredQuality);

                    // If still too large, reduce quality iteratively
                    int currentQuality = desiredQuality;
                    while (compressedData.Length > MaxFileSizeBytes && currentQuality > MinimumQuality)
                    {
                        currentQuality -= 5; // Reduce by 5% increments
                        _logger.LogInformation(
                            "Image still too large ({size} bytes), reducing quality to {quality}%",
                            compressedData.Length, currentQuality);

                        compressedData = await CompressToQualityAsync(image, currentQuality);
                    }

                    // If still too large after minimum quality, log error but return (user should upgrade plan)
                    if (compressedData.Length > MaxFileSizeBytes)
                    {
                        _logger.LogWarning(
                            "Compressed image ({size} bytes) exceeds maximum ({max} bytes) even at quality {quality}%",
                            compressedData.Length, MaxFileSizeBytes, currentQuality);
                    }

                    stopwatch.Stop();

                    var result = new ImageCompressionResult
                    {
                        OriginalSize = originalSize,
                        CompressedSize = compressedData.Length,
                        CompressionRatio = originalSize > 0
                            ? Math.Round((decimal)originalSize / compressedData.Length, 2)
                            : 1m,
                        Quality = currentQuality,
                        Brightness = brightness,
                        CompressedData = compressedData,
                        ProcessingTimeMs = stopwatch.ElapsedMilliseconds
                    };

                    _logger.LogInformation(
                        "Image compressed: {original} -> {compressed} bytes ({ratio:F2}:1) at {quality}% quality ({time}ms)",
                        result.OriginalSize, result.CompressedSize, result.CompressionRatio,
                        result.Quality, result.ProcessingTimeMs);

                    return result;
                }
            }
        }
        catch (UnknownImageFormatException ex)
        {
            _logger.LogError(ex, "Image format not recognized");
            throw new InvalidOperationException("Invalid image format. JPEG format required.", ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Image compression failed");
            throw new InvalidOperationException("Image compression failed", ex);
        }
    }

    /// <summary>
    /// Compresses image to specified JPEG quality level.
    /// </summary>
    private async Task<byte[]> CompressToQualityAsync(Image<Rgba32> image, int quality)
    {
        var jpegEncoder = new JpegEncoder
        {
            Quality = quality
        };

        using (var output = new MemoryStream())
        {
            await image.SaveAsJpegAsync(output, jpegEncoder);
            return output.ToArray();
        }
    }

    /// <summary>
    /// Estimates image brightness by analyzing pixel luminance.
    /// Uses perceived brightness formula: 0.299R + 0.587G + 0.114B
    /// </summary>
    /// <param name="image">Image to analyze</param>
    /// <returns>Brightness as percentage (0-100)</returns>
    private decimal EstimateBrightness(Image<Rgba32> image)
    {
        if (image.Width == 0 || image.Height == 0)
            return 50m; // Return neutral if image is empty

        // Sample pixels from the image (every 10th pixel for efficiency on large images)
        int sampleInterval = Math.Max(1, (image.Width + image.Height) / 20);
        double totalBrightness = 0;
        int sampleCount = 0;

        try
        {
            image.ProcessPixelRows(accessor =>
            {
                for (int y = 0; y < image.Height; y += sampleInterval)
                {
                    var row = accessor.GetRowSpan(y);
                    for (int x = 0; x < row.Length; x += sampleInterval)
                    {
                        var pixel = row[x];
                        // Perceived brightness formula (luminance)
                        double brightness = (0.299 * pixel.R + 0.587 * pixel.G + 0.114 * pixel.B) / 255.0;
                        totalBrightness += brightness;
                        sampleCount++;
                    }
                }
            });

            if (sampleCount == 0)
                return 50m;

            // Convert to 0-100 percentage
            decimal averageBrightness = (decimal)(totalBrightness / sampleCount);
            var brightnessPercentage = Math.Round(averageBrightness * 100, 1);

            // Clamp to valid range
            return Math.Max(0, Math.Min(100, brightnessPercentage));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to estimate brightness, using default");
            return 50m; // Return neutral value on failure
        }
    }
}

/// <summary>
/// Result of image compression operation.
/// Contains compressed data and compression metrics.
/// </summary>
public class ImageCompressionResult
{
    /// <summary>
    /// Original image size in bytes.
    /// </summary>
    public long OriginalSize { get; set; }

    /// <summary>
    /// Compressed image size in bytes.
    /// </summary>
    public long CompressedSize { get; set; }

    /// <summary>
    /// Compression ratio (original / compressed).
    /// Example: 3.5 means original was 3.5x larger.
    /// </summary>
    public decimal CompressionRatio { get; set; }

    /// <summary>
    /// JPEG quality used (0-100).
    /// </summary>
    public int Quality { get; set; }

    /// <summary>
    /// Estimated image brightness (0-100%).
    /// </summary>
    public decimal Brightness { get; set; }

    /// <summary>
    /// Compressed image bytes (JPEG format).
    /// </summary>
    public byte[]? CompressedData { get; set; }

    /// <summary>
    /// Time taken to compress image (milliseconds).
    /// </summary>
    public long ProcessingTimeMs { get; set; }
}
