using SkinProgress.Services.Interfaces;

namespace SkinProgress.Services;

public class FileService : IFileService
{
    private readonly IWebHostEnvironment _environment;

    public FileService(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public async Task<string> SaveFileAsync(IFormFile file, string fileName)
    {
        // Ensure WebRootPath is not null. If it is, default to a "wwwroot" folder in the current directory.
        var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        
        var uploadsFolder = Path.Combine(webRootPath, "uploads");
        
        if (!Directory.Exists(uploadsFolder))
        {
            Directory.CreateDirectory(uploadsFolder);
        }

        // Ensure the file has an extension
        var extension = Path.GetExtension(file.FileName);
        var fullFileName = $"{fileName}{extension}";
        var filePath = Path.Combine(uploadsFolder, fullFileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        return $"/uploads/{fullFileName}";
    }

    public void DeleteFile(string filePath)
    {
        if (string.IsNullOrEmpty(filePath)) return;

        // Ensure WebRootPath is not null
        var webRootPath = _environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

        // Remove the leading slash if present to get the relative path
        var relativePath = filePath.TrimStart('/');
        var fullPath = Path.Combine(webRootPath, relativePath);

        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }
    }
}