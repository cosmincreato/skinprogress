using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SkinProgress.Models.DTOs;
using SkinProgress.Services;

namespace SkinProgress.Controllers;

/// <summary>
/// API endpoints for photo upload, retrieval, and deletion.
/// All endpoints require JWT authentication (Bearer token).
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
[Produces("application/json")]
public class PhotoController : ControllerBase
{
    private readonly PhotoService _photoService;
    private readonly ILogger<PhotoController> _logger;

    public PhotoController(PhotoService photoService, ILogger<PhotoController> logger)
    {
        _photoService = photoService ?? throw new ArgumentNullException(nameof(photoService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Uploads a single selfie photo (front, left, or right view).
    /// </summary>
    [HttpPost("capture")]
    [ProducesResponseType(typeof(PhotoUploadResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PhotoUploadResponseDto>> UploadPhoto([FromBody] PhotoUploadRequestDto request)
    {
        try
        {
            var userIdClaim = User.FindFirst("sub")?.Value ?? User.FindFirst("nameid")?.Value;
            if (!Guid.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new { message = "Invalid authentication token" });
            }

            if (request == null)
                return BadRequest(new { message = "Request body is required" });

            var result = await _photoService.UploadPhotoAsync(userId, request);

            _logger.LogInformation("Photo uploaded: {photoId}", result.PhotoId);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid upload request");
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Upload  processing failed");
            if (ex.Message.Contains("exceed"))
                return StatusCode(StatusCodes.Status413PayloadTooLarge, new { message = ex.Message });
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Photo upload error");
            return StatusCode(StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>
    /// Retrieves user's photo history.
    /// </summary>
    [HttpGet("history")]
    [ProducesResponseType(typeof(PhotoHistoryResponseDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<PhotoHistoryResponseDto>> GetPhotoHistory([FromQuery] int days = 30)
    {
        try
        {
            var userIdClaim = User.FindFirst("sub")?.Value ?? User.FindFirst("nameid")?.Value;
            if (!Guid.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized();
            }

            if (days < 1 || days > 365)
                days = 30;

            var history = await _photoService.GetPhotoHistoryAsync(userId, days);
            _logger.LogInformation("History retrieved for user {userId}", userId);
            return Ok(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "History error");
            return StatusCode(StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>
    /// Deletes a photo.
    /// </summary>
    [HttpDelete("{photoId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeletePhoto(Guid photoId)
    {
        try
        {
            var userIdClaim = User.FindFirst("sub")?.Value ?? User.FindFirst("nameid")?.Value;
            if (!Guid.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized();
            }

            if (photoId == Guid.Empty)
                return BadRequest(new { message = "Invalid photo ID" });

            await _photoService.DeletePhotoAsync(userId, photoId);
            _logger.LogInformation("Photo deleted: {photoId}", photoId);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Photo not found");
            return NotFound(new { message = "Photo not found" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Delete error");
            return StatusCode(StatusCodes.Status500InternalServerError);
        }
    }

    /// <summary>
    /// Health check endpoint.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("health")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Health()
    {
        return Ok(new { status = "healthy", service = "photo-api" });
    }
}
