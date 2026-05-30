namespace SkinProgress.Services.Interfaces;

public interface IOllamaEmbeddingService
{
    /// <summary>
    /// Generates a text embedding vector via Ollama /api/embed.
    /// </summary>
    /// <param name="text">The text to embed. Must not be null or empty.</param>
    /// <returns>A float array (1024 dimensions for bge-m3:latest).</returns>
    /// <exception cref="ArgumentException">Thrown when text is null or whitespace.</exception>
    /// <exception cref="HttpRequestException">Thrown when Ollama is unreachable or returns an error. Callers in fire-and-forget contexts should wrap in try/catch.</exception>
    Task<float[]> EmbedAsync(string text);
}
