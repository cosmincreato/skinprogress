namespace SkinProgress.Services.Interfaces;

public interface IFileService
{
    Task<(string fileName, string fileUrl)> SaveFileAsync(IFormFile file, string folderName);
    void DeleteFile(string filePath);
}