using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SkinProgress.Data;
using SkinProgress.Models;
using SkinProgress.Models.DTOs;
using SkinProgress.Models.Entities;
using SkinProgress.Services.Interfaces;
using System.Security.Claims;

namespace SkinProgress.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IFileService _fileService;

    public UsersController(AppDbContext context, IFileService fileService)
    {
        _context = context;
        _fileService = fileService;
    }

    // GET: api/users
    // Only Admins can see all users
    [HttpGet]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetUsers()
    {
        var users = await _context.Users
            .Select(u => new UserDto(u.Id, u.Email, u.Username, u.Role, u.SkinType, u.ProfilePictureUrl, u.CreatedAt))
            .ToListAsync();
            
        return Ok(users);
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

        return new UserDto(user.Id, user.Email, user.Username, user.Role, user.SkinType, user.ProfilePictureUrl, user.CreatedAt);
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
        var fileName = id.ToString(); 
        var fileUrl = await _fileService.SaveFileAsync(file, fileName);

        user.ProfilePictureUrl = fileUrl;
        await _context.SaveChangesAsync();

        return Ok(new { ProfilePictureUrl = fileUrl });
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

    private bool UserExists(Guid id)
    {
        return _context.Users.Any(e => e.Id == id);
    }
}