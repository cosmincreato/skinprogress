using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SkinProgress.Data;
using SkinProgress.Models;
using SkinProgress.Models.Entities;
using SkinProgress.Services.Interfaces;
using System.Security.Claims;

namespace SkinProgress.Controllers;

[ApiController]
[Route("api/habits")]
[Authorize]
public class HabitsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IQdrantService _qdrantService;
    private readonly ILogger<HabitsController> _logger;

    public HabitsController(AppDbContext context, IQdrantService qdrantService, ILogger<HabitsController> logger)
    {
        _context = context;
        _qdrantService = qdrantService;
        _logger = logger;
    }

    private Guid GetUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdClaim, out var id) ? id : Guid.Empty;
    }

    /// <summary>
    /// Initialize default habits if they don't exist
    /// </summary>
    [HttpPost("initialize")]
    public async Task<ActionResult> InitializeHabits()
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        // Ensure all three default habits exist
        string[] requiredHabits = { "Cleanse", "Hydrate", "SPF" };
        var descriptions = new Dictionary<string, string>
        {
            { "Cleanse", "Daily cleansing routine" },
            { "Hydrate", "Daily hydration routine" },
            { "SPF", "Daily SPF application" }
        };

        foreach (var habitName in requiredHabits)
        {
            var existing = await _context.HabitDefinitions
                .FirstOrDefaultAsync(h => h.Name == habitName);

            if (existing == null)
            {
                var newHabit = new HabitDefinition
                {
                    Name = habitName,
                    Description = descriptions[habitName],
                    IsDefault = true
                };
                _context.HabitDefinitions.Add(newHabit);
            }
        }

        await _context.SaveChangesAsync();
        return Ok();
    }

    /// <summary>
    /// Save or update daily habit completion
    /// </summary>
    [HttpPost("complete")]
    public async Task<ActionResult> CompleteHabit([FromBody] CompleteHabitRequest request)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        // Get habit definition
        var habitDef = await _context.HabitDefinitions
            .FirstOrDefaultAsync(h => h.Name == request.HabitName);

        if (habitDef == null)
            return NotFound("Habit not found");

        // Check if completion already exists for today
        var today = DateTime.UtcNow.Date;
        var existingCompletion = await _context.HabitCompletions
            .FirstOrDefaultAsync(hc =>
                hc.UserId == userId &&
                hc.HabitDefinitionId == habitDef.Id &&
                hc.Date.Date == today);

        if (existingCompletion == null)
        {
            var completion = new HabitCompletion
            {
                UserId = userId,
                HabitDefinitionId = habitDef.Id,
                CompletedAt = DateTime.UtcNow,
                Date = today
            };
            _context.HabitCompletions.Add(completion);
        }

        await _context.SaveChangesAsync();

        // Fire when all 3 required habits are completed today (upserts via deterministic point ID)
        try
        {
            string[] requiredHabits = { "Cleanse", "Hydrate", "SPF" };

            var todayCompletedNames = await _context.HabitCompletions
                .Where(hc => hc.UserId == userId && hc.Date.Date == today)
                .Include(hc => hc.HabitDefinition)
                .Select(hc => hc.HabitDefinition!.Name)
                .ToListAsync();

            _logger.LogInformation("Habit check: completed today for user {UserId}: {Names}",
                userId, string.Join(", ", todayCompletedNames));

            if (requiredHabits.All(h => todayCompletedNames.Contains(h)))
            {
                _logger.LogInformation("All required habits complete — firing QuestLockInEvent for user {UserId}", userId);

                _ = Task.Run(async () => await _qdrantService.LogActivityEventAsync(
                    userId.ToString(),
                    new QuestLockInEvent
                    {
                        HabitNames = requiredHabits,
                        Timestamp = DateTime.UtcNow
                    }
                ));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error logging quest lock-in event");
        }

        return Ok();
    }

    /// <summary>
    /// Get daily habit completions for a given date
    /// </summary>
    [HttpGet("daily")]
    public async Task<ActionResult<DailyHabitsResponse>> GetDailyHabits([FromQuery] DateTime? date = null)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        var targetDate = (date ?? DateTime.UtcNow).Date;

        var completions = await _context.HabitCompletions
            .Where(hc => hc.UserId == userId && hc.Date.Date == targetDate)
            .Include(hc => hc.HabitDefinition)
            .ToListAsync();

        var habits = await _context.HabitDefinitions
            .Where(h => h.IsDefault)
            .ToListAsync();

        var response = new DailyHabitsResponse
        {
            Date = targetDate,
            Habits = habits.Select(h => new HabitStatusDto
            {
                HabitName = h.Name,
                IsCompleted = completions.Any(c => c.HabitDefinitionId == h.Id)
            }).ToList()
        };

        return Ok(response);
    }

    /// <summary>
    /// Get habit completions for a date range
    /// </summary>
    [HttpGet("range")]
    public async Task<ActionResult<List<DateHabitsDto>>> GetHabitRange(
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        var completions = await _context.HabitCompletions
            .Where(hc => hc.UserId == userId && hc.Date >= startDate && hc.Date <= endDate)
            .Include(hc => hc.HabitDefinition)
            .ToListAsync();

        var habits = await _context.HabitDefinitions
            .Where(h => h.IsDefault)
            .ToListAsync();

        var groupedByDate = completions
            .GroupBy(c => c.Date.Date)
            .Select(g => new DateHabitsDto
            {
                Date = g.Key,
                Habits = habits.Select(h => new HabitStatusDto
                {
                    HabitName = h.Name,
                    IsCompleted = g.Any(c => c.HabitDefinitionId == h.Id)
                }).ToList(),
                IsComplete = habits.All(h => g.Any(c => c.HabitDefinitionId == h.Id))
            })
            .OrderByDescending(d => d.Date)
            .ToList();

        return Ok(groupedByDate);
    }

    /// <summary>
    /// Get user's current habit streak
    /// </summary>
    [HttpGet("streak")]
    public async Task<ActionResult<StreakResponse>> GetStreak()
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        var habits = await _context.HabitDefinitions
            .Where(h => h.IsDefault)
            .ToListAsync();

        var streaks = await _context.HabitStreaks
            .Where(hs => hs.UserId == userId)
            .ToListAsync();

        var response = new StreakResponse
        {
            CurrentStreak = streaks.FirstOrDefault()?.CurrentStreak ?? 0,
            LongestStreak = streaks.FirstOrDefault()?.LongestStreak ?? 0
        };

        return Ok(response);
    }

    /// <summary>
    /// Get all user badges
    /// </summary>
    [HttpGet("badges")]
    public async Task<ActionResult<List<UserBadgeDto>>> GetUserBadges()
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        var userBadges = await _context.UserBadges
            .Where(ub => ub.UserId == userId)
            .Include(ub => ub.Badge)
            .ToListAsync();

        var badgeDtos = userBadges.Select(ub => new UserBadgeDto
        {
            BadgeId = ub.BadgeId,
            BadgeName = ub.Badge.Name,
            BadgeCode = ub.Badge.Code,
            BadgeDescription = ub.Badge.Description,
            AwardedAt = ub.AwardedAt
        }).ToList();

        return Ok(badgeDtos);
    }

    /// <summary>
    /// Award a badge to a user (internal use)
    /// </summary>
    [HttpPost("award-badge")]
    public async Task<ActionResult> AwardBadge([FromBody] AwardBadgeRequest request)
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized();

        // Get or create badge
        var badge = await _context.Badges
            .FirstOrDefaultAsync(b => b.Code == request.BadgeCode);

        if (badge == null)
        {
            badge = new Badge
            {
                Code = request.BadgeCode,
                Name = request.BadgeName,
                Description = request.BadgeDescription
            };
            _context.Badges.Add(badge);
            await _context.SaveChangesAsync();
        }

        // Check if user already has badge
        var existingBadge = await _context.UserBadges
            .FirstOrDefaultAsync(ub => ub.UserId == userId && ub.BadgeId == badge.Id);

        if (existingBadge == null)
        {
            var userBadge = new UserBadge
            {
                UserId = userId,
                BadgeId = badge.Id
            };
            _context.UserBadges.Add(userBadge);
            await _context.SaveChangesAsync();
        }

        return Ok();
    }
}

// DTOs
public class CompleteHabitRequest
{
    public string HabitName { get; set; } = string.Empty;
}

public class DailyHabitsResponse
{
    public DateTime Date { get; set; }
    public List<HabitStatusDto> Habits { get; set; } = new();
}

public class DateHabitsDto
{
    public DateTime Date { get; set; }
    public List<HabitStatusDto> Habits { get; set; } = new();
    public bool IsComplete { get; set; }
}

public class HabitStatusDto
{
    public string HabitName { get; set; } = string.Empty;
    public bool IsCompleted { get; set; }
}

public class StreakResponse
{
    public int CurrentStreak { get; set; }
    public int LongestStreak { get; set; }
}

public class UserBadgeDto
{
    public Guid BadgeId { get; set; }
    public string BadgeName { get; set; } = string.Empty;
    public string BadgeCode { get; set; } = string.Empty;
    public string BadgeDescription { get; set; } = string.Empty;
    public DateTime AwardedAt { get; set; }
}

public class AwardBadgeRequest
{
    public string BadgeCode { get; set; } = string.Empty;
    public string BadgeName { get; set; } = string.Empty;
    public string BadgeDescription { get; set; } = string.Empty;
}
