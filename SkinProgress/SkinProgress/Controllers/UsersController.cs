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

    public UsersController(AppDbContext context, IFileService fileService, IWebHostEnvironment environment, IHttpClientFactory httpClientFactory)
    {
        _context = context;
        _fileService = fileService;
        _environment = environment;
        _httpClientFactory = httpClientFactory;
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

        var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var userSelfieFolder = Path.Combine(webRootPath, "selfies", userId.ToString());
        Directory.CreateDirectory(userSelfieFolder);

        var today = DateTime.UtcNow.Date;
        var todaysSelfies = Directory.GetFiles(userSelfieFolder)
            .Select(filePath => new
            {
                FilePath = filePath,
                UploadedAt = System.IO.File.GetLastWriteTimeUtc(filePath),
                Angle = TryExtractAngle(Path.GetFileName(filePath))
            })
            .Where(f => f.UploadedAt.Date == today)
            .ToList();

        if (todaysSelfies.Any())
        {
            return Conflict(new { message = "You already took your selfie for today." });
        }

        if (todaysSelfies.Any(s => string.Equals(s.Angle, normalizedAngle, StringComparison.OrdinalIgnoreCase)))
        {
            return Conflict(new { message = $"You already uploaded the {normalizedAngle} selfie for today." });
        }

        var todaysAngles = todaysSelfies
            .Where(s => !string.IsNullOrWhiteSpace(s.Angle))
            .Select(s => s.Angle!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (todaysAngles.Count >= RequiredSelfieAngles.Count)
        {
            return Conflict(new { message = "You already completed your 3 selfies for today." });
        }

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

        // Update the last selfie date
        user.LastSelfieAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { fileName, fileUrl, angle = normalizedAngle });
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
            return Ok(json);
        }
        catch
        {
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "AI analysis returned an invalid response." });
        }
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