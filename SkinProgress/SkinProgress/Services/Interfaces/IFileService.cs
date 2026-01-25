namespace SkinProgress.Services.Interfaces;

public interface IFileService
{
    Task<string> SaveFileAsync(IFormFile file, string fileName);
    void DeleteFile(string filePath);
}