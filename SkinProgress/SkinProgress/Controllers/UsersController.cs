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

        if (todaysSelfieCapture != null)
        {
            // Check if this angle was already uploaded
            if (normalizedAngle == "front" && todaysSelfieCapture.FrontPhotoId.HasValue)
            {
                return Conflict(new { message = $"You already uploaded the front selfie for today." });
            }
            if (normalizedAngle == "left" && todaysSelfieCapture.LeftPhotoId.HasValue)
            {
                return Conflict(new { message = $"You already uploaded the left selfie for today." });
            }
            if (normalizedAngle == "right" && todaysSelfieCapture.RightPhotoId.HasValue)
            {
                return Conflict(new { message = $"You already uploaded the right selfie for today." });
            }

            // Check if already complete
            if (todaysSelfieCapture.FrontPhotoId.HasValue && todaysSelfieCapture.LeftPhotoId.HasValue && todaysSelfieCapture.RightPhotoId.HasValue)
            {
                return Conflict(new { message = "You already completed your 3 selfies for today." });
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
    public IActionResult DeleteTodaysSelfies()
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

            var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var userSelfieFolder = Path.Combine(webRootPath, "selfies", userId.ToString());

            if (!Directory.Exists(userSelfieFolder))
            {
                return Ok(new { message = "No selfies found for today." });
            }

            var today = DateTime.UtcNow.Date;
            var todaysSelfies = Directory.GetFiles(userSelfieFolder)
                .Select(filePath => new
                {
                    FilePath = filePath,
                    UploadedAt = System.IO.File.GetLastWriteTimeUtc(filePath)
                })
                .Where(f => f.UploadedAt.Date == today)
                .ToList();

            int deletedCount = 0;
            foreach (var selfie in todaysSelfies)
            {
                try
                {
                    System.IO.File.Delete(selfie.FilePath);
                    deletedCount++;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Failed to delete file {selfie.FilePath}: {ex.Message}");
                    // Continue deleting other files even if one fails
                }
            }

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
    public IActionResult GetSelfies(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var userSelfieFolder = Path.Combine(webRootPath, "selfies", id.ToString());

        if (!Directory.Exists(userSelfieFolder))
        {
            return Ok(new { selfies = new List<object>(), totalPages = 0 });
        }

        var selfieFiles = Directory.GetFiles(userSelfieFolder)
            .Select(filePath => new
            {
                FileName = Path.GetFileName(filePath),
                UploadedAt = System.IO.File.GetLastWriteTimeUtc(filePath),
                Angle = TryExtractAngle(Path.GetFileName(filePath))
            })
            .OrderByDescending(f => f.UploadedAt)
            .ToList();

        var groupedByDay = selfieFiles
            .GroupBy(f => f.UploadedAt.Date)
            .OrderByDescending(g => g.Key)
            .ToList();

        var totalDays = groupedByDay.Count;
        var totalPages = (int)Math.Ceiling((double)totalDays / pageSize);

        var paginatedSelfies = groupedByDay
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(dayGroup =>
            {
                var photos = dayGroup
                    .OrderBy(p => GetAngleSortOrder(p.Angle))
                    .ThenBy(p => p.UploadedAt)
                    .Select(f => new
                    {
                        url = GetFullUrl($"/selfies/{id}/{f.FileName}"),
                        uploadedAt = f.UploadedAt,
                        angle = f.Angle
                    })
                    .ToList();

                var dayAngles = photos
                    .Where(p => !string.IsNullOrWhiteSpace(p.angle))
                    .Select(p => p.angle!)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                return new
                {
                    date = dayGroup.Key,
                    photos,
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

        var targetDate = parsedDate.Date;
        var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var userSelfieFolder = Path.Combine(webRootPath, "selfies", id.ToString());

        if (!Directory.Exists(userSelfieFolder))
        {
            return NotFound(new { message = "No selfies found for this user." });
        }

        var filesByAngle = Directory.GetFiles(userSelfieFolder)
            .Select(filePath => new
            {
                FilePath = filePath,
                UploadedAt = System.IO.File.GetLastWriteTimeUtc(filePath),
                Angle = TryExtractAngle(Path.GetFileName(filePath))
            })
            .Where(f => f.UploadedAt.Date == targetDate && !string.IsNullOrWhiteSpace(f.Angle))
            .GroupBy(f => f.Angle!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(x => x.UploadedAt).First(),
                StringComparer.OrdinalIgnoreCase
            );

        if (!RequiredSelfieAngles.All(angle => filesByAngle.ContainsKey(angle)))
        {
            return BadRequest(new { message = "This set is incomplete. Front, left, and right photos are required." });
        }

        var client = _httpClientFactory.CreateClient("AiAnalyzer");

        using var content = new MultipartFormDataContent();
        foreach (var angle in RequiredSelfieAngles)
        {
            var fileStream = new FileStream(filesByAngle[angle].FilePath, FileMode.Open, FileAccess.Read, FileShare.Read);
            var streamContent = new StreamContent(fileStream);
            streamContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
            content.Add(streamContent, angle, Path.GetFileName(filesByAngle[angle].FilePath));
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
            var json = JsonSerializer.Deserialize<JsonElement>(body);

            Console.WriteLine($"AnalyzeSelfieSet - Response from AI service: {body}");
            Console.WriteLine($"AnalyzeSelfieSet - Parsed JSON element: {json}");

            // Check if overall_scores exists
            if (json.TryGetProperty("overall_scores", out var scoresElement))
            {
                Console.WriteLine($"AnalyzeSelfieSet - overall_scores found: {scoresElement}");
            }
            else
            {
                Console.WriteLine($"AnalyzeSelfieSet - No overall_scores in response!");
            }

            // Save heatmap to database
            try
            {
                await SaveAnalysisHeatmapAsync(json, id, targetDate);
            }
            catch (Exception ex)
            {
                // Log error but don't fail the request
                Console.WriteLine($"Error saving heatmap to database: {ex.Message}");
                Console.WriteLine($"Error saving heatmap stack trace: {ex.StackTrace}");
            }

            return Ok(json);
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
    private async Task SaveAnalysisHeatmapAsync(JsonElement analysisJson, Guid userId, DateTime analysisDate)
    {
        try
        {
            // Log full response for debugging
            Console.WriteLine($"SaveAnalysisHeatmapAsync - Full response: {analysisJson}");

            // Extract per_angle data
            if (!analysisJson.TryGetProperty("per_angle", out var perAngleElement))
            {
                Console.WriteLine("SaveAnalysisHeatmapAsync - No per_angle found");
                return;
            }

            var perAngle = perAngleElement.Deserialize<Dictionary<string, JsonElement>>();
            if (perAngle == null)
            {
                Console.WriteLine("SaveAnalysisHeatmapAsync - perAngle is null");
                return;
            }

            // Create heatmap directory
            var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var heatmapDir = Path.Combine(webRootPath, "heatmaps", userId.ToString());
            Directory.CreateDirectory(heatmapDir);

            // Save heatmaps for each angle (front, left, right)
            var heatmapUrls = new Dictionary<string, string>();
            foreach (var angle in new[] { "front", "left", "right" })
            {
                if (!perAngle.ContainsKey(angle))
                {
                    Console.WriteLine($"SaveAnalysisHeatmapAsync - No {angle} angle data");
                    continue;
                }

                var angleData = perAngle[angle];
                if (!angleData.TryGetProperty("heatmap_overlay_data_url", out var heatmapElement))
                {
                    Console.WriteLine($"SaveAnalysisHeatmapAsync - No heatmap_overlay_data_url in {angle}");
                    continue;
                }

                var heatmapDataUrl = heatmapElement.GetString();
                if (string.IsNullOrEmpty(heatmapDataUrl) || !heatmapDataUrl.StartsWith("data:image/png;base64,"))
                {
                    Console.WriteLine($"SaveAnalysisHeatmapAsync - Heatmap data URL is invalid or empty for {angle}");
                    continue;
                }

                // Extract base64 data
                var base64Data = heatmapDataUrl.Substring("data:image/png;base64,".Length);
                var imageBytes = Convert.FromBase64String(base64Data);

                var heatmapFileName = $"{analysisDate:yyyy-MM-dd}-{angle}.png";
                var heatmapFilePath = Path.Combine(heatmapDir, heatmapFileName);

                // Save PNG file
                await System.IO.File.WriteAllBytesAsync(heatmapFilePath, imageBytes);
                Console.WriteLine($"SaveAnalysisHeatmapAsync - Saved {angle} heatmap to {heatmapFilePath}");

                heatmapUrls[angle] = $"/heatmaps/{userId}/{heatmapFileName}";
            }

            if (heatmapUrls.Count == 0)
            {
                Console.WriteLine("SaveAnalysisHeatmapAsync - No valid heatmaps found for any angle");
                return;
            }

            // Extract severity scores for AnalysisResult
            var acneSeverity = ExtractSeverityScore(analysisJson, "acne");
            var rednessSeverity = ExtractSeverityScore(analysisJson, "redness");
            var underEyeBagsSeverity = ExtractSeverityScore(analysisJson, "under_eye_bags");

            Console.WriteLine($"SaveAnalysisHeatmapAsync - Extracted scores: acne={acneSeverity}, redness={rednessSeverity}, underEyeBags={underEyeBagsSeverity}");

            // Create AnalysisResult record
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
                HeatmapImageUrl = heatmapUrls.ContainsKey("front") ? heatmapUrls["front"] : null,
                HeatmapFrontUrl = heatmapUrls.ContainsKey("front") ? heatmapUrls["front"] : null,
                HeatmapLeftUrl = heatmapUrls.ContainsKey("left") ? heatmapUrls["left"] : null,
                HeatmapRightUrl = heatmapUrls.ContainsKey("right") ? heatmapUrls["right"] : null,
                CreatedAt = DateTime.UtcNow,
            };

            Console.WriteLine($"SaveAnalysisHeatmapAsync - Saved AnalysisResult: AcneSeverity={analysisResult.AcneSeverity}, RednessSeverity={analysisResult.RednessSeverity}, UnderEyeBagsSeverity={analysisResult.UnderEyeBagsSeverity}");
            Console.WriteLine($"SaveAnalysisHeatmapAsync - Heatmap URLs: Front={analysisResult.HeatmapFrontUrl}, Left={analysisResult.HeatmapLeftUrl}, Right={analysisResult.HeatmapRightUrl}");

            _context.AnalysisResults.Add(analysisResult);
            await _context.SaveChangesAsync();

            // Store analysis in Qdrant for RAG pipeline
            try
            {
                await _qdrantService.StoreAnalysisAsync(userId.ToString(), analysisResult);
                
                // Generate personalized recommendations based on analysis history
                var recommendations = await _qdrantService.GenerateRecommendationsAsync(userId.ToString(), analysisResult);
                Console.WriteLine($"Generated {recommendations.Count} recommendations for user {userId}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Qdrant storage error (non-blocking): {ex.Message}");
                // Don't throw - Qdrant failure shouldn't block analysis workflow
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"SaveAnalysisHeatmapAsync error: {ex.Message}");
            throw;
        }
    }

    /// <summary>
    /// Extracts severity score (0-1) from overall_scores in analysis response.
    /// </summary>
    private static double ExtractSeverityScore(JsonElement analysisJson, string key)
    {
        try
        {
            if (analysisJson.TryGetProperty("overall_scores", out var scoresElement))
            {
                Console.WriteLine($"ExtractSeverityScore - Extracting key '{key}' from: {scoresElement.GetRawText()}");
                var scores = scoresElement.Deserialize<Dictionary<string, double>>();
                if (scores != null)
                {
                    Console.WriteLine($"ExtractSeverityScore - Available keys in overall_scores: {string.Join(", ", scores.Keys)}");
                    if (scores.TryGetValue(key, out var score))
                    {
                        Console.WriteLine($"ExtractSeverityScore - Found {key}={score}");
                        return Math.Clamp(score, 0.0, 1.0);
                    }
                    Console.WriteLine($"ExtractSeverityScore - Key '{key}' not found in overall_scores");
                }
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

        var analyses = await _context.AnalysisResults
            .Where(ar => ar.UserId == id.ToString() && ar.Status == "Completed")
            .OrderByDescending(ar => ar.Timestamp)
            .Select(ar => new
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
                heatmapImageUrl = ar.HeatmapImageUrl,
                heatmapFrontUrl = ar.HeatmapFrontUrl,
                heatmapLeftUrl = ar.HeatmapLeftUrl,
                heatmapRightUrl = ar.HeatmapRightUrl,
                timestamp = ar.Timestamp,
                status = ar.Status
            })
            .ToListAsync();

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