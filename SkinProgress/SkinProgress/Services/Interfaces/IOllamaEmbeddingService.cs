namespace SkinProgress.Services.Interfaces;

public interface IOllamaEmbeddingService
{
    Task<float[]> EmbedAsync(string text);
}
