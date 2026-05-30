using System.Net.Http.Json;
using SkinProgress.Models;
using SkinProgress.Services.Interfaces;

namespace SkinProgress.Services;

public class QdrantService : IQdrantService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<QdrantService> _logger;
    private readonly IOllamaEmbeddingService _embedding;
    private readonly string _qdrantUrl;
    private readonly string _activityCollectionName = "skinprogress_activity_log";
    private bool _isActivityCollectionInitialized = false;
    private readonly SemaphoreSlim _activityInitLock = new SemaphoreSlim(1, 1);

    public QdrantService(HttpClient httpClient, ILogger<QdrantService> logger, IConfiguration config, IOllamaEmbeddingService embedding)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _embedding = embedding ?? throw new ArgumentNullException(nameof(embedding));

        var host = config["Qdrant:Host"] ?? "qdrant";
        var port = config["Qdrant:Port"] ?? "6333";
        _qdrantUrl = $"http://{host}:{port}";

        _ = Task.Run(() => EnsureActivityCollectionInitializedAsync());
    }

    private async Task EnsureActivityCollectionInitializedAsync()
    {
        if (_isActivityCollectionInitialized) return;

        await _activityInitLock.WaitAsync();
        try
        {
            if (_isActivityCollectionInitialized) return;
            await InitializeActivityCollectionAsync();
            _isActivityCollectionInitialized = true;
        }
        finally
        {
            _activityInitLock.Release();
        }
    }

    private async Task InitializeActivityCollectionAsync()
    {
        int retries = 3;
        while (retries > 0)
        {
            try
            {
                var checkUrl = $"{_qdrantUrl}/collections/{_activityCollectionName}";
                var response = await _httpClient.GetAsync(checkUrl);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Creating Qdrant collection: {CollectionName}", _activityCollectionName);

                    var createRequest = new
                    {
                        vectors = new { size = 1024, distance = "Cosine" }
                    };

                    var createResponse = await _httpClient.PutAsJsonAsync(checkUrl, createRequest);
                    if (!createResponse.IsSuccessStatusCode)
                    {
                        retries--;
                        if (retries > 0) await Task.Delay(2000);
                    }
                    else
                    {
                        _logger.LogInformation("Activity log collection created successfully");
                        return;
                    }
                }
                else
                {
                    _logger.LogInformation("Activity log collection already exists");
                    return;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error initializing activity collection (retries left: {Retries})", retries);
                retries--;
                if (retries > 0) await Task.Delay(2000);
            }
        }

        _logger.LogWarning("Failed to initialize activity log collection after 3 retries. Service will attempt on-demand.");
    }

    public async Task LogActivityEventAsync(string userId, ActivityEvent evt)
    {
        _logger.LogInformation("LogActivityEventAsync called: {EventType} for user {UserId}", evt.EventType, userId);
        try
        {
            await EnsureActivityCollectionInitializedAsync();

            var text = evt.ToText();
            _logger.LogInformation("Prepared text for {EventType}: {Text}", evt.EventType, text);

            float[] vector;
            try
            {
                vector = await _embedding.EmbedAsync(text);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Embedding failed for {EventType}, skipping Qdrant write", evt.EventType);
                return;
            }

            var metadata = new Dictionary<string, object>
            {
                ["user_id"] = userId,
                ["event_type"] = evt.EventType,
                ["timestamp"] = evt.Timestamp.ToString("O"),
                ["date"] = evt.Timestamp.ToString("yyyy-MM-dd"),
            };

            foreach (var kv in evt.ToMetadata())
                metadata[kv.Key] = kv.Value;

            var payload = new Dictionary<string, object>
            {
                ["pageContent"] = text,
                ["metadata"] = metadata,
            };

            var pointId = evt.GetPointId(userId);
            _logger.LogInformation("Writing point {PointId} to Qdrant for {EventType}", pointId, evt.EventType);

            var point = new
            {
                id = pointId,
                vector,
                payload
            };

            var url = $"{_qdrantUrl}/collections/{_activityCollectionName}/points?wait=true";
            var response = await _httpClient.PutAsJsonAsync(url, new { points = new[] { point } });

            if (!response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to log activity event {EventType}: {Content}", evt.EventType, content);
            }
            else
            {
                _logger.LogInformation("Activity event logged: {EventType} for user {UserId}", evt.EventType, userId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error logging activity event {EventType} for user {UserId}", evt.EventType, userId);
        }
    }

    public async Task DeleteUserDataAsync(string userId)
    {
        try
        {
            await EnsureActivityCollectionInitializedAsync();

            var deleteRequest = new
            {
                filter = new
                {
                    must = new[]
                    {
                        new { key = "metadata.user_id", match = new { value = userId } }
                    }
                }
            };

            var url = $"{_qdrantUrl}/collections/{_activityCollectionName}/points/delete";
            var response = await _httpClient.PostAsJsonAsync(url, deleteRequest);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Activity log data deleted from Qdrant: {UserId}", userId);
            }
            else
            {
                var content = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to delete activity log data from Qdrant for user {UserId}: {Content}", userId, content);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting user data from Qdrant for user {UserId}", userId);
        }
    }
}
