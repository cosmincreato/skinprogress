using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SkinProgress.Data;
using SkinProgress.Models;
using SkinProgress.Models.DTOs;
using SkinProgress.Models.Entities;
using SkinProgress.Services.Interfaces;
using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SkinProgress.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private static readonly HashSet<string> RequiredSelfieAngles = new(StringComparer.OrdinalIgnoreCase)
    {
        "front",
        "left",
        "right"
    };

    private readonly AppDbContext _context;
    private readonly IFileService _fileService;
    private readonly IWebHostEnvironment _environment;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IQdrantService _qdrantService;

    public UsersController(AppDbContext context, IFileService fileService, IWebHostEnvironment environment, IHttpClientFactory httpClientFactory, IQdrantService qdrantService)
    {
        _context = context;
        _fileService = fileService;
        _environment = environment;
        _httpClientFactory = httpClientFactory;
        _qdrantService = qdrantService;
    }

    private string GetFullUrl(string relativeUrl)
    {
        if (string.IsNullOrEmpty(relativeUrl) || relativeUrl.StartsWith("http"))
        {
            return relativeUrl;
        }
        return $"{Request.Scheme}://{Request.Host}{relativeUrl}";
    }

    // GET: api/users
    // Only Admins can see all users
    [HttpGet]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetUsers()
    {
        var users = await _context.Users.ToListAsync();

        var userDtos = users.Select(u => new UserDto(
            u.Id,
            u.Email,
            u.Username,
            u.Role,
            u.SkinType,
            GetFullUrl(u.ProfilePictureUrl),
            u.CreatedAt,
            u.LastSelfieAt
        )).ToList();

        return Ok(userDtos);
    }

    // GET: api/users/{id}
    // Admins can see anyone; Users can only see themselves
    [HttpGet("{id}")]
    [Authorize]
    public async Task<ActionResult<UserDto>> GetUser(Guid id)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        var user = await _context.Users.FindAsync(id);

        if (user == null)
        {
            return NotFound();
        }

        return new UserDto(
            user.Id,
            user.Email,
            user.Username,
            user.Role,
            user.SkinType,
            GetFullUrl(user.ProfilePictureUrl),
            user.CreatedAt,
            user.LastSelfieAt
        );
    }

    // PUT: api/users/{id}
    // Admins can update anyone; Users can only update themselves
    [HttpPut("{id}")]
    [Authorize]
    public async Task<IActionResult> UpdateUser(Guid id, UpdateUserDto dto)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();

        // Update fields if provided
        if (!string.IsNullOrEmpty(dto.Email)) user.Email = dto.Email;
        if (!string.IsNullOrEmpty(dto.Username)) user.Username = dto.Username;
        if (!string.IsNullOrEmpty(dto.SkinType)) user.SkinType = dto.SkinType;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            if (!UserExists(id)) return NotFound();
            throw;
        }

        return NoContent();
    }

    // POST: api/users/{id}/profile-picture
    [HttpPost("{id}/profile-picture")]
    [Authorize]
    public async Task<IActionResult> UploadProfilePicture(Guid id, IFormFile file)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();

        if (file == null || file.Length == 0)
            return BadRequest("No file uploaded.");

        // Delete old picture if it's not the default one
        if (!string.IsNullOrEmpty(user.ProfilePictureUrl) && !user.ProfilePictureUrl.Contains("default-profile"))
        {
            _fileService.DeleteFile(user.ProfilePictureUrl);
        }

        // Save new file
        // We use the userId as the filename to keep it unique per user (or overwrite existing)
        // Adding a timestamp to avoid browser caching issues could be a good enhancement, 
        // but for now, we'll stick to userId + extension as requested.
        var (fileName, fileUrl) = await _fileService.SaveFileAsync(file, "profile-pictures");

        user.ProfilePictureUrl = fileUrl;
        await _context.SaveChangesAsync();

        return Ok(new { ProfilePictureUrl = GetFullUrl(fileUrl) });
    }

    [HttpPost("selfie")]
    [Authorize]
    public async Task<IActionResult> UploadSelfie(IFormFile file, [FromForm] string angle)
    {
        var userIdString = User.Claims.FirstOrDefault(c => c.Type == "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value;
        if (userIdString == null)
        {
            return Unauthorized();
        }

        if (!Guid.TryParse(userIdString, out var userId))
        {
            return Unauthorized();
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return Unauthorized();
        }

        var normalizedAngle = NormalizeAngle(angle);
        if (normalizedAngle == null)
        {
            return BadRequest(new { message = "Angle is required and must be one of: front, left, right." });
        }

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "No file uploaded." });
        }

        var today = DateTime.UtcNow.Date;
        
        // Check database for existing today's SelfieCapture to see if this angle was already uploaded
        var todaysSelfieCapture = await _context.SelfieCaptures
            .FirstOrDefaultAsync(s => s.UserId == userId && s.CaptureDate == today && s.DeletedAt == null);

        // Track if we're replacing an existing photo for this angle
        Guid? oldPhotoIdToDelete = null;

        if (todaysSelfieCapture != null)
        {
            // Check if this angle was already uploaded - if so, we'll replace it
            if (normalizedAngle == "front" && todaysSelfieCapture.FrontPhotoId.HasValue)
            {
                oldPhotoIdToDelete = todaysSelfieCapture.FrontPhotoId;
            }
            else if (normalizedAngle == "left" && todaysSelfieCapture.LeftPhotoId.HasValue)
            {
                oldPhotoIdToDelete = todaysSelfieCapture.LeftPhotoId;
            }
            else if (normalizedAngle == "right" && todaysSelfieCapture.RightPhotoId.HasValue)
            {
                oldPhotoIdToDelete = todaysSelfieCapture.RightPhotoId;
            }
        }

        var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var userSelfieFolder = Path.Combine(webRootPath, "selfies", userId.ToString());
        Directory.CreateDirectory(userSelfieFolder);

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = ".jpg";
        }

        var fileName = $"{today:yyyyMMdd}_{normalizedAngle}_{Guid.NewGuid()}{extension}";
        var filePath = Path.Combine(userSelfieFolder, fileName);

        await using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var fileUrl = GetFullUrl($"/selfies/{userId}/{fileName}");

        // If replacing an existing photo for this angle, delete the old one
        if (oldPhotoIdToDelete.HasValue)
        {
            var oldPhoto = await _context.Photos.FirstOrDefaultAsync(p => p.PhotoId == oldPhotoIdToDelete.Value);
            if (oldPhoto != null)
            {
                // Delete the old file from disk
                try
                {
                    var oldFilePath = Path.Combine(webRootPath, oldPhoto.FilePath.TrimStart('/'));
                    if (System.IO.File.Exists(oldFilePath))
                    {
                        System.IO.File.Delete(oldFilePath);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error deleting old photo file: {ex.Message}");
                }

                // Delete metadata
                if (oldPhoto.MetadataId != Guid.Empty)
                {
                    var oldMetadata = await _context.PhotoMetadatas.FirstOrDefaultAsync(m => m.MetadataId == oldPhoto.MetadataId);
                    if (oldMetadata != null)
                    {
                        _context.PhotoMetadatas.Remove(oldMetadata);
                    }
                }

                // Delete the old photo record
                _context.Photos.Remove(oldPhoto);
                await _context.SaveChangesAsync();
            }
        }

        // Create a Photo record in the database
        var photoId = Guid.NewGuid();
        var photo = new Photo
        {
            PhotoId = photoId,
            UserId = userId,
            ViewType = normalizedAngle,
            CaptureDate = today,
            FilePath = $"/selfies/{userId}/{fileName}",
            FileSize = file.Length,
            MetadataId = Guid.NewGuid(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            DeletedAt = null
        };

        // Create PhotoMetadata record
        var metadata = new PhotoMetadata
        {
            MetadataId = photo.MetadataId,
            PhotoId = photoId,
            CaptureTimestamp = DateTime.UtcNow,
            Brightness = 50, // Default value
            FaceDetectionConfidence = 0.95m, // Default minimum
            FaceCount = 1,
            CompressionQuality = 85,
            CreatedAt = DateTime.UtcNow
        };

        photo.Metadata = metadata;
        _context.Photos.Add(photo);
        _context.PhotoMetadatas.Add(metadata);
        await _context.SaveChangesAsync();

        // Get or create SelfieCapture for today
        var selfieCapture = todaysSelfieCapture ?? new SelfieCapture
        {
            CaptureId = Guid.NewGuid(),
            UserId = userId,
            CaptureDate = today,
            Status = "partial",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        // Update the appropriate angle field
        if (normalizedAngle == "front")
            selfieCapture.FrontPhotoId = photoId;
        else if (normalizedAngle == "left")
            selfieCapture.LeftPhotoId = photoId;
        else if (normalizedAngle == "right")
            selfieCapture.RightPhotoId = photoId;

        // Check if now complete
        if (selfieCapture.FrontPhotoId.HasValue && selfieCapture.LeftPhotoId.HasValue && selfieCapture.RightPhotoId.HasValue)
        {
            selfieCapture.Status = "complete";
        }

        if (todaysSelfieCapture == null)
        {
            _context.SelfieCaptures.Add(selfieCapture);
        }
        else
        {
            selfieCapture.UpdatedAt = DateTime.UtcNow;
        }

        // Update the last selfie date
        user.LastSelfieAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { fileName, fileUrl, angle = normalizedAngle });
    }

    [HttpDelete("selfies/today")]
    [Authorize]
    public async Task<IActionResult> DeleteTodaysSelfies()
    {
        try
        {
            var userIdString = User.Claims.FirstOrDefault(c => c.Type == "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value;
            if (userIdString == null)
            {
                return Unauthorized();
            }

            if (!Guid.TryParse(userIdString, out var userId))
            {
                return Unauthorized();
            }

            var today = DateTime.UtcNow.Date;
            var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

            // Delete Photo DB records and their files for today
            var todaysPhotos = await _context.Photos
                .Where(p => p.UserId == userId && p.CaptureDate == today && p.DeletedAt == null)
                .ToListAsync();

            int deletedCount = todaysPhotos.Count;

            foreach (var photo in todaysPhotos)
            {
                try
                {
                    var filePath = Path.Combine(webRootPath, photo.FilePath.TrimStart('/'));
                    if (System.IO.File.Exists(filePath))
                    {
                        System.IO.File.Delete(filePath);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to delete file for photo {photo.PhotoId}: {ex.Message}");
                }

                if (photo.MetadataId != Guid.Empty)
                {
                    var metadata = await _context.PhotoMetadatas.FirstOrDefaultAsync(m => m.MetadataId == photo.MetadataId);
                    if (metadata != null)
                    {
                        _context.PhotoMetadatas.Remove(metadata);
                    }
                }

                _context.Photos.Remove(photo);
            }

            // Delete the SelfieCapture session for today so the next upload starts fresh
            var todaysCapture = await _context.SelfieCaptures
                .FirstOrDefaultAsync(s => s.UserId == userId && s.CaptureDate == today && s.DeletedAt == null);

            if (todaysCapture != null)
            {
                _context.SelfieCaptures.Remove(todaysCapture);
            }

            await _context.SaveChangesAsync();

            return Ok(new { message = $"Deleted {deletedCount} selfie(s) from today." });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"DeleteTodaysSelfies error: {ex.Message}");
            return StatusCode(500, new { message = "An error occurred while deleting selfies.", error = ex.Message });
        }
    }

    /// <summary>
    /// Gets personalized skincare recommendations based on latest analysis and historical trends.
    /// Uses Qdrant RAG pipeline to generate context-aware recommendations.
    /// </summary>
    [HttpGet("{id}/recommendations")]
    [Authorize]
    public async Task<IActionResult> GetRecommendations(Guid id)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        try
        {
            // Get the latest analysis for this user
            var latestAnalysis = await _context.AnalysisResults
                .Where(ar => ar.UserId == id.ToString() && ar.Status == "Completed")
                .OrderByDescending(ar => ar.Timestamp)
                .FirstOrDefaultAsync();

            if (latestAnalysis == null)
            {
                return Ok(new { message = "No completed analyses found. Analyze your selfies to get recommendations.", recommendations = new List<object>() });
            }

            var recommendations = await _qdrantService.GenerateRecommendationsAsync(id.ToString(), latestAnalysis);
            return Ok(new { analysisDate = latestAnalysis.Timestamp, recommendations });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"GetRecommendations error: {ex.Message}");
            return StatusCode(500, new { message = "Error retrieving recommendations", error = ex.Message });
        }
    }

    /// <summary>
    /// Gets analysis history stored in Qdrant vector database.
    /// Used for RAG pipeline and historical pattern analysis.
    /// </summary>
    [HttpGet("{id}/analysis-history")]
    [Authorize]
    public async Task<IActionResult> GetAnalysisHistory(Guid id)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        try
        {
            var history = await _qdrantService.GetUserAnalysisHistoryAsync(id.ToString());
            return Ok(new { count = history.Count, analyses = history });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"GetAnalysisHistory error: {ex.Message}");
            return StatusCode(500, new { message = "Error retrieving analysis history", error = ex.Message });
        }
    }

    /// <summary>
    /// Stores user lifestyle context (habits, routines, etc.) for recommendation personalization.
    /// </summary>
    [HttpPost("{id}/user-context")]
    [Authorize]
    public async Task<IActionResult> StoreUserContext(Guid id, [FromBody] Dictionary<string, string> contextData)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        try
        {
            if (contextData == null || contextData.Count == 0)
            {
                return BadRequest(new { message = "Context data is required" });
            }

            await _qdrantService.StoreUserContextAsync(id.ToString(), contextData);
            return Ok(new { message = "User context stored successfully" });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"StoreUserContext error: {ex.Message}");
            return StatusCode(500, new { message = "Error storing user context", error = ex.Message });
        }
    }

    // DELETE: api/users/{id}
    // Admins can delete anyone; Users can only delete themselves
    [HttpDelete("{id}")]
    [Authorize]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        try
        {
            // Delete user data from Qdrant for GDPR compliance
            await _qdrantService.DeleteUserDataAsync(id.ToString());
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error deleting user data from Qdrant: {ex.Message}");
            // Continue with database deletion even if Qdrant deletion fails
        }

        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();

        // Delete profile picture if exists
        if (!string.IsNullOrEmpty(user.ProfilePictureUrl) && !user.ProfilePictureUrl.Contains("default-profile"))
        {
            _fileService.DeleteFile(user.ProfilePictureUrl);
        }

        _context.Users.Remove(user);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("{id}/selfies")]
    [Authorize]
    public async Task<IActionResult> GetSelfies(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        // Query selfies from database instead of scanning file system
        var photos = await _context.Photos
            .Where(p => p.UserId == id && p.DeletedAt == null)
            .OrderByDescending(p => p.CaptureDate)
            .ThenByDescending(p => p.CreatedAt)
            .ToListAsync();

        if (!photos.Any())
        {
            return Ok(new { selfies = new List<object>(), totalPages = 0 });
        }

        var groupedByDay = photos
            .GroupBy(p => p.CaptureDate.Date)
            .OrderByDescending(g => g.Key)
            .ToList();

        var totalDays = groupedByDay.Count;
        var totalPages = (int)Math.Ceiling((double)totalDays / pageSize);

        var paginatedSelfies = groupedByDay
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(dayGroup =>
            {
                var photos_by_angle = dayGroup
                    .OrderBy(p => GetAngleSortOrder(p.ViewType))
                    .ThenByDescending(p => p.CreatedAt)
                    .Select(p => new
                    {
                        url = GetFullUrl(p.FilePath),
                        uploadedAt = p.CreatedAt,
                        angle = p.ViewType
                    })
                    .ToList();

                var dayAngles = photos_by_angle
                    .Where(p => !string.IsNullOrWhiteSpace(p.angle))
                    .Select(p => p.angle!)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                return new
                {
                    date = dayGroup.Key,
                    photos = photos_by_angle,
                    isComplete = RequiredSelfieAngles.All(a => dayAngles.Contains(a))
                };
            })
            .ToList();

        return Ok(new { selfies = paginatedSelfies, totalPages });
    }

    [HttpPost("{id}/selfies/{date}/analyze")]
    [Authorize]
    public async Task<IActionResult> AnalyzeSelfieSet(Guid id, string date)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        if (!DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsedDate))
        {
            return BadRequest(new { message = "Date must be in yyyy-MM-dd format." });
        }

        var targetDate = DateTime.SpecifyKind(parsedDate.Date, DateTimeKind.Utc);
        
        // Query photos from database for the target date
        var photosForDate = await _context.Photos
            .Where(p => p.UserId == id && p.CaptureDate == targetDate && p.DeletedAt == null)
            .ToListAsync();

        if (!photosForDate.Any())
        {
            return NotFound(new { message = "No selfies found for this date." });
        }

        // Group by ViewType and get the latest of each angle
        var photosByAngle = photosForDate
            .GroupBy(p => p.ViewType!.ToLower(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(p => p.CreatedAt).First(),
                StringComparer.OrdinalIgnoreCase
            );

        if (!RequiredSelfieAngles.All(angle => photosByAngle.ContainsKey(angle)))
        {
            return BadRequest(new { message = "This set is incomplete. Front, left, and right photos are required." });
        }

        var client = _httpClientFactory.CreateClient("AiAnalyzer");

        using var content = new MultipartFormDataContent();
        var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        
        foreach (var angle in RequiredSelfieAngles)
        {
            var photo = photosByAngle[angle];
            var filePath = Path.Combine(webRootPath, photo.FilePath.TrimStart('/'));
            
            if (!System.IO.File.Exists(filePath))
            {
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    message = $"Photo file not found for {angle} angle.",
                    filePath = filePath
                });
            }

            var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            var streamContent = new StreamContent(fileStream);
            streamContent.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            content.Add(streamContent, angle, Path.GetFileName(filePath));
        }

        content.Add(new StringContent(id.ToString()), "user_id");
        content.Add(new StringContent(targetDate.ToString("yyyy-MM-dd")), "date");

        HttpResponseMessage aiResponse;
        try
        {
            aiResponse = await client.PostAsync("/analyze-set", content);
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = "Could not reach AI analyzer service.",
                details = ex.Message
            });
        }

        var body = await aiResponse.Content.ReadAsStringAsync();
        if (!aiResponse.IsSuccessStatusCode)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = "AI analysis failed.",
                aiStatusCode = (int)aiResponse.StatusCode,
                details = body
            });
        }

        try
        {
            // Use JsonNode end-to-end. Returning JsonElement is fragile because it references a JsonDocument
            // that can be collected before ASP.NET serializes the response, causing ObjectDisposedException.
            var responseNode = JsonNode.Parse(body) as JsonObject;
            if (responseNode is null)
            {
                return StatusCode(StatusCodes.Status502BadGateway, new { message = "AI analysis returned an invalid response." });
            }

            Console.WriteLine($"AnalyzeSelfieSet - Response from AI service: {body}");
            Console.WriteLine($"AnalyzeSelfieSet - Parsed JSON node: {responseNode}");

            // Check if overall_scores exists
            if (responseNode["overall_scores"] is not null)
            {
                Console.WriteLine($"AnalyzeSelfieSet - overall_scores found: {responseNode["overall_scores"]}");
            }
            else
            {
                Console.WriteLine($"AnalyzeSelfieSet - No overall_scores in response!");
            }

            // Save heatmap to database
            Dictionary<string, string> savedHeatmapUrls = new(StringComparer.OrdinalIgnoreCase);
            try
            {
                savedHeatmapUrls = await SaveAnalysisHeatmapAsync(responseNode, id, targetDate);
            }
            catch (Exception ex)
            {
                // Log error but don't fail the request
                Console.WriteLine($"Error saving heatmap to database: {ex.Message}");
                Console.WriteLine($"Error saving heatmap stack trace: {ex.StackTrace}");
            }

            // Avoid returning large base64-encoded PNGs to the UI (can cause rendering/memory issues).
            // Always strip base64 payloads from the response. If we saved heatmaps to disk,
            // replace them with file URLs; otherwise set them to null so the UI won't choke.
            if (responseNode?["per_angle"] is JsonObject perAngleNode)
            {
                foreach (var angle in new[] { "front", "left", "right" })
                {
                    if (perAngleNode[angle] is not JsonObject angleNode)
                        continue;

                    if (savedHeatmapUrls.TryGetValue(angle, out var relativeUrl))
                    {
                        var fullUrl = GetFullUrl(relativeUrl);
                        angleNode["heatmap_overlay_data_url"] = fullUrl;
                        Console.WriteLine($"AnalyzeSelfieSet - Set {angle} heatmap URL: {fullUrl}");
                    }
                    else
                    {
                        angleNode["heatmap_overlay_data_url"] = null;
                        Console.WriteLine($"AnalyzeSelfieSet - No heatmap URL found for {angle}");
                    }
                }
                Console.WriteLine($"AnalyzeSelfieSet - Final response per_angle: {perAngleNode.ToJsonString()}");
                return Ok(responseNode);
            }

            return Ok(responseNode);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"AnalyzeSelfieSet - Exception during JSON parse: {ex}");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "AI analysis returned an invalid response." });
        }
    }

    /// <summary>
    /// Saves the heatmap overlay from AI analysis to database.
    /// Extracts heatmap data URL from front angle, saves as PNG file, and creates AnalysisResult record.
    /// </summary>
    private async Task<Dictionary<string, string>> SaveAnalysisHeatmapAsync(JsonObject analysisJson, Guid userId, DateTime analysisDate)
    {
        // Extract per_angle data
        if (analysisJson["per_angle"] is not JsonObject perAngleObj)
        {
            Console.WriteLine("SaveAnalysisHeatmapAsync - No per_angle found");
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        // Save heatmap files and collect their relative URLs.
        // This is the primary goal — always return these even if the DB insert later fails.
        var heatmapUrls = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var heatmapDir = Path.Combine(webRootPath, "heatmaps", userId.ToString());
            Directory.CreateDirectory(heatmapDir);

            foreach (var angle in new[] { "front", "left", "right" })
            {
                if (perAngleObj[angle] is not JsonObject angleData)
                {
                    Console.WriteLine($"SaveAnalysisHeatmapAsync - No {angle} angle data");
                    continue;
                }

                var heatmapDataUrl = angleData["heatmap_overlay_data_url"]?.GetValue<string>();
                if (string.IsNullOrEmpty(heatmapDataUrl) || !heatmapDataUrl.StartsWith("data:image/png;base64,"))
                {
                    Console.WriteLine($"SaveAnalysisHeatmapAsync - Heatmap data URL is invalid or empty for {angle}");
                    continue;
                }

                var base64Data = heatmapDataUrl.Substring("data:image/png;base64,".Length);
                var imageBytes = Convert.FromBase64String(base64Data);

                var heatmapFileName = $"{analysisDate:yyyy-MM-dd}-{angle}.png";
                var heatmapFilePath = Path.Combine(heatmapDir, heatmapFileName);

                await System.IO.File.WriteAllBytesAsync(heatmapFilePath, imageBytes);
                Console.WriteLine($"SaveAnalysisHeatmapAsync - Saved {angle} heatmap to {heatmapFilePath}");

                heatmapUrls[angle] = $"/heatmaps/{userId}/{heatmapFileName}";
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"SaveAnalysisHeatmapAsync - Error saving heatmap files: {ex.Message}");
            return heatmapUrls; // return whatever was saved before the error
        }

        if (heatmapUrls.Count == 0)
        {
            Console.WriteLine("SaveAnalysisHeatmapAsync - No valid heatmaps found for any angle");
            return heatmapUrls;
        }

        // Persist to DB and Qdrant. These are non-critical for the current response —
        // if they fail the heatmap URLs are still returned to the caller.
        try
        {
            var acneSeverity = ExtractSeverityScore(analysisJson, "acne");
            var rednessSeverity = ExtractSeverityScore(analysisJson, "redness");
            var underEyeBagsSeverity = ExtractSeverityScore(analysisJson, "under_eye_bags");

            var analysisResult = new AnalysisResult
            {
                Id = Guid.NewGuid(),
                UserId = userId.ToString(),
                SelfieId = userId,
                Timestamp = DateTime.SpecifyKind(analysisDate.Date, DateTimeKind.Utc),
                AcneSeverity = (int?)Math.Round(acneSeverity * 10),
                RednessSeverity = (int?)Math.Round(rednessSeverity * 10),
                UnderEyeBagsSeverity = (int?)Math.Round(underEyeBagsSeverity * 10),
                Status = "Completed",
                HeatmapImageUrl = heatmapUrls.GetValueOrDefault("front"),
                HeatmapFrontUrl = heatmapUrls.GetValueOrDefault("front"),
                HeatmapLeftUrl = heatmapUrls.GetValueOrDefault("left"),
                HeatmapRightUrl = heatmapUrls.GetValueOrDefault("right"),
                CreatedAt = DateTime.UtcNow,
            };

            _context.AnalysisResults.Add(analysisResult);
            await _context.SaveChangesAsync();

            try
            {
                await _qdrantService.StoreAnalysisAsync(userId.ToString(), analysisResult);

                var scoreEventData = new Dictionary<string, string>
                {
                    { "acne_score", analysisResult.AcneSeverity?.ToString() ?? "0" },
                    { "redness_score", analysisResult.RednessSeverity?.ToString() ?? "0" },
                    { "under_eye_bags_score", analysisResult.UnderEyeBagsSeverity?.ToString() ?? "0" },
                    { "overall_score", (((analysisResult.AcneSeverity ?? 0) + (analysisResult.RednessSeverity ?? 0) + (analysisResult.UnderEyeBagsSeverity ?? 0)) / 3.0).ToString() }
                };
                await _qdrantService.StoreUserActivityAsync(userId.ToString(), "score_update", scoreEventData);

                var recommendations = await _qdrantService.GenerateRecommendationsAsync(userId.ToString(), analysisResult);
                Console.WriteLine($"Generated {recommendations.Count} recommendations for user {userId}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Qdrant storage error (non-blocking): {ex.Message}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"SaveAnalysisHeatmapAsync - DB persist failed (non-blocking): {ex.Message}");
        }

        return heatmapUrls;
    }

    /// <summary>
    /// Extracts severity score (0-1) from overall_scores in analysis response.
    /// </summary>
    private static double ExtractSeverityScore(JsonObject analysisJson, string key)
    {
        try
        {
            if (analysisJson["overall_scores"] is JsonObject scoresObj)
            {
                var raw = scoresObj[key]?.GetValue<double?>() ?? 0.0;
                Console.WriteLine($"ExtractSeverityScore - Found {key}={raw}");
                return Math.Clamp(raw, 0.0, 1.0);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ExtractSeverityScore error for key '{key}': {ex.Message}");
        }
        return 0.0;
    }

    /// <summary>
    /// Gets the heatmap analysis result for a specific date if it exists in the database.
    /// Used by gallery to display cached heatmaps without re-analyzing.
    /// </summary>
    [HttpGet("{id}/analysis/{date}")]
    [Authorize]
    public async Task<IActionResult> GetAnalysisForDate(Guid id, string date)
    {
        try
        {
            var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

            if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
            {
                return Forbid();
            }

            if (!DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsedDate))
            {
                return BadRequest(new { message = "Date must be in yyyy-MM-dd format." });
            }

            var targetDate = parsedDate.Date;
            Console.WriteLine($"GetAnalysisForDate - Looking for analysis: userId={id}, date={targetDate:yyyy-MM-dd}");

            // Find AnalysisResult for this user and date
            var analysis = await _context.AnalysisResults
                .Where(ar => ar.UserId == id.ToString() && ar.Timestamp.Date == targetDate)
                .FirstOrDefaultAsync();

            if (analysis == null)
            {
                Console.WriteLine($"GetAnalysisForDate - No analysis found for userId={id}, date={targetDate:yyyy-MM-dd}");
                return NotFound(new { message = "No analysis found for this date." });
            }

            Console.WriteLine($"GetAnalysisForDate - Found analysis: Acne={analysis.AcneSeverity}, Redness={analysis.RednessSeverity}");

            return Ok(new
            {
                acneSeverity = analysis.AcneSeverity,
                rednessSeverity = analysis.RednessSeverity,
                heatmapImageUrl = analysis.HeatmapImageUrl,
                timestamp = analysis.Timestamp,
                status = analysis.Status
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"GetAnalysisForDate - Exception: {ex}");
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Error retrieving analysis", details = ex.Message });
        }
    }

    /// <summary>
    /// Gets all analysis results for a user, ordered by date descending.
    /// Used by gallery to load all cached analyses for trend analysis and graphs.
    /// </summary>
    [HttpGet("{id}/analyses")]
    [Authorize]
    public async Task<IActionResult> GetAllAnalyses(Guid id)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        var rawAnalyses = await _context.AnalysisResults
            .Where(ar => ar.UserId == id.ToString() && ar.Status == "Completed")
            .OrderByDescending(ar => ar.Timestamp)
            .ToListAsync();

        var analyses = rawAnalyses.Select(ar => new
        {
            date = ar.Timestamp.ToString("yyyy-MM-dd"),
            acneSeverity = ar.AcneSeverity,
            rednessSeverity = ar.RednessSeverity,
            underEyeBagsSeverity = ar.UnderEyeBagsSeverity,
            inflammationSeverity = ar.InflammationSeverity,
            foreheadSeverity = ar.ForeheadSeverity,
            leftCheekSeverity = ar.LeftCheekSeverity,
            rightCheekSeverity = ar.RightCheekSeverity,
            chinSeverity = ar.ChinSeverity,
            noseSeverity = ar.NoseSeverity,
            heatmapImageUrl = GetFullUrl(ar.HeatmapImageUrl),
            heatmapFrontUrl = GetFullUrl(ar.HeatmapFrontUrl),
            heatmapLeftUrl = GetFullUrl(ar.HeatmapLeftUrl),
            heatmapRightUrl = GetFullUrl(ar.HeatmapRightUrl),
            timestamp = ar.Timestamp,
            status = ar.Status
        }).ToList();

        Console.WriteLine($"GetAllAnalyses for user {id}: Found {analyses.Count} completed analyses");
        foreach (var a in analyses)
        {
            Console.WriteLine($"  Date: {a.date}");
            Console.WriteLine($"    Acne: {a.acneSeverity ?? -1} (null if -1)");
            Console.WriteLine($"    Redness: {a.rednessSeverity ?? -1} (null if -1)");
            Console.WriteLine($"    Inflammation: {a.inflammationSeverity ?? -1} (null if -1)");
            Console.WriteLine($"    Heatmap URLs:");
            Console.WriteLine($"      Front: {a.heatmapFrontUrl}");
            Console.WriteLine($"      Left: {a.heatmapLeftUrl}");
            Console.WriteLine($"      Right: {a.heatmapRightUrl}");
            Console.WriteLine($"      Legacy: {a.heatmapImageUrl}");
        }

        return Ok(analyses);
    }

    /// <summary>
    /// Debug endpoint: Returns ALL analysis results (including incomplete ones) for a user.
    /// </summary>
    [HttpGet("{id}/analyses-debug")]
    [Authorize]
    public async Task<IActionResult> GetAllAnalysesDebug(Guid id)
    {
        var currentUserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var currentUserRole = User.FindFirst(ClaimTypes.Role)?.Value;

        if (currentUserRole != UserRoles.Admin && currentUserId != id.ToString())
        {
            return Forbid();
        }

        var analyses = await _context.AnalysisResults
            .Where(ar => ar.UserId == id.ToString())
            .OrderByDescending(ar => ar.Timestamp)
            .Select(ar => new
            {
                id = ar.Id,
                date = ar.Timestamp.ToString("yyyy-MM-dd"),
                acneSeverity = ar.AcneSeverity,
                rednessSeverity = ar.RednessSeverity,
                inflammationSeverity = ar.InflammationSeverity,
                heatmapImageUrl = ar.HeatmapImageUrl,
                timestamp = ar.Timestamp,
                status = ar.Status,
                createdAt = ar.CreatedAt
            })
            .ToListAsync();

        Console.WriteLine($"GetAllAnalysesDebug for user {id}: Found {analyses.Count} total analyses");
        foreach (var a in analyses)
        {
            Console.WriteLine($"  ID: {a.id}, Date: {a.date}, Status: {a.status}, Acne: {a.acneSeverity}, Redness: {a.rednessSeverity}, Heatmap: {a.heatmapImageUrl}");
        }

        return Ok(new { totalCount = analyses.Count, analyses = analyses });
    }

    private static string? NormalizeAngle(string? angle)
    {
        if (string.IsNullOrWhiteSpace(angle))
        {
            return null;
        }

        var normalized = angle.Trim().ToLowerInvariant();
        return normalized switch
        {
            "front" => "front",
            "left" => "left",
            "left-side" => "left",
            "leftside" => "left",
            "right" => "right",
            "right-side" => "right",
            "rightside" => "right",
            _ => null
        };
    }

    private static string? TryExtractAngle(string fileName)
    {
        var nameWithoutExtension = Path.GetFileNameWithoutExtension(fileName);
        if (string.IsNullOrWhiteSpace(nameWithoutExtension))
        {
            return null;
        }

        var parts = nameWithoutExtension.Split('_', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2)
        {
            return null;
        }

        var parsedAngle = NormalizeAngle(parts[1]);
        return parsedAngle;
    }

    private static int GetAngleSortOrder(string? angle)
    {
        return angle?.ToLowerInvariant() switch
        {
            "front" => 0,
            "left" => 1,
            "right" => 2,
            _ => 99
        };
    }

    private bool UserExists(Guid id)
    {
        return _context.Users.Any(e => e.Id == id);
    }
}