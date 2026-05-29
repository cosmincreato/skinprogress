using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using SkinProgress.Services.Interfaces;

namespace SkinProgress.Services;

public class OllamaEmbeddingService : IOllamaEmbeddingService
{
    private readonly HttpClient _httpClient;
    private readonly string _model;
    private readonly ILogger<OllamaEmbeddingService> _logger;

    public OllamaEmbeddingService(HttpClient httpClient, IConfiguration config, ILogger<OllamaEmbeddingService> logger)
    {
        _httpClient = httpClient;
        _model = config["Ollama:EmbeddingModel"] ?? "bge-m3:latest";
        _logger = logger;

        var host = config["Ollama:Host"] ?? "ollama";
        var port = config["Ollama:Port"] ?? "11434";
        _httpClient.BaseAddress = new Uri($"http://{host}:{port}");
    }

    public async Task<float[]> EmbedAsync(string text)
    {
        var request = new { model = _model, input = text };
        var response = await _httpClient.PostAsJsonAsync("/api/embed", request);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("embeddings")[0]
                   .EnumerateArray()
                   .Select(e => e.GetSingle())
                   .ToArray();
    }
}
