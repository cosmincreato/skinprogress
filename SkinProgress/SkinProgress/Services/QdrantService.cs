using System.Net.Http.Json;
using System.Text.Json;
using SkinProgress.Models;
using SkinProgress.Models.Entities;
using SkinProgress.Services.Interfaces;

namespace SkinProgress.Services;

/// <summary>
/// Implementation of Qdrant vector database operations for RAG pipeline.
/// Stores analysis results, user context, and generates recommendations based on vector similarity.
/// </summary>
public class QdrantService : IQdrantService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<QdrantService> _logger;
    private readonly string _qdrantUrl;
    private readonly string _collectionName = "skinprogress_analyses";
    private readonly string _activityCollectionName = "skinprogress_activity_log";
    private readonly IOllamaEmbeddingService _ollamaEmbeddingService;
    private bool _isInitialized = false;
    private readonly SemaphoreSlim _initializationLock = new SemaphoreSlim(1, 1);
    private bool _isActivityCollectionInitialized = false;
    private readonly SemaphoreSlim _activityInitLock = new SemaphoreSlim(1, 1);

    public QdrantService(HttpClient httpClient, ILogger<QdrantService> logger, IConfiguration config, IOllamaEmbeddingService ollamaEmbeddingService)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _ollamaEmbeddingService = ollamaEmbeddingService ?? throw new ArgumentNullException(nameof(ollamaEmbeddingService));

        var host = config["Qdrant:Host"] ?? "qdrant";
        var port = config["Qdrant:Port"] ?? "6333";
        _qdrantUrl = $"http://{host}:{port}";

        _ = Task.Run(() => EnsureCollectionInitializedAsync());
        _ = Task.Run(() => EnsureActivityCollectionInitializedAsync());
    }

    /// <summary>
    /// Ensures Qdrant collection is initialized. Lazy initialization on first use.
    /// </summary>
    private async Task EnsureCollectionInitializedAsync()
    {
        if (_isInitialized) return;

        await _initializationLock.WaitAsync();
        try
        {
            if (_isInitialized) return;

            _logger.LogInformation("Initializing Qdrant collection: {CollectionName}", _collectionName);
            await InitializeCollectionAsync();
            _isInitialized = true;
        }
        finally
        {
            _initializationLock.Release();
        }
    }

    /// <summary>
    /// Initializes Qdrant collection on service startup.
    /// </summary>
    private async Task InitializeCollectionAsync()
    {
        int retries = 3;
        while (retries > 0)
        {
            try
            {
                // Check if collection exists
                var checkUrl = $"{_qdrantUrl}/collections/{_collectionName}";
                var response = await _httpClient.GetAsync(checkUrl);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Creating Qdrant collection: {CollectionName}", _collectionName);

                    // Create collection with vector size 8 (7 zones + 1 aggregated score)
                    var createRequest = new
                    {
                        vectors = new
                        {
                            size = 8,
                            distance = "Cosine"
                        }
                    };

                    var createResponse = await _httpClient.PutAsJsonAsync(checkUrl, createRequest);
                    if (!createResponse.IsSuccessStatusCode)
                    {
                        var content = await createResponse.Content.ReadAsStringAsync();
                        _logger.LogError("Failed to create Qdrant collection: {Content}", content);
                        retries--;
                        if (retries > 0)
                        {
                            await Task.Delay(2000); // Wait 2 seconds before retry
                            continue;
                        }
                    }
                    else
                    {
                        _logger.LogInformation("Qdrant collection created successfully");
                        return;
                    }
                }
                else
                {
                    _logger.LogInformation("Qdrant collection already exists");
                    return;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error initializing Qdrant collection (retries left: {Retries})", retries);
                retries--;
                if (retries > 0)
                {
                    await Task.Delay(2000); // Wait 2 seconds before retry
                }
            }
        }

        _logger.LogWarning("Failed to initialize Qdrant collection after 3 retries. Service will attempt on-demand.");
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

    public async Task<string> StoreAnalysisAsync(string userId, AnalysisResult analysisResult)
    {
        await EnsureCollectionInitializedAsync();
        try
        {
            // Generate vector from analysis scores (normalized 0-1)
            var vector = GenerateAnalysisVector(analysisResult);
            var pointId = $"{userId}_{analysisResult.Timestamp:yyyy-MM-dd}";

            var metadata = new
            {
                user_id = userId,
                analysis_id = analysisResult.Id.ToString(),
                timestamp = analysisResult.Timestamp.ToString("O"),
                acne_severity = analysisResult.AcneSeverity,
                redness_severity = analysisResult.RednessSeverity,
                under_eye_bags_severity = analysisResult.UnderEyeBagsSeverity,
                forehead_severity = analysisResult.ForeheadSeverity,
                left_cheek_severity = analysisResult.LeftCheekSeverity,
                right_cheek_severity = analysisResult.RightCheekSeverity,
                chin_severity = analysisResult.ChinSeverity,
                nose_severity = analysisResult.NoseSeverity,
                status = analysisResult.Status,
                heatmap_url = analysisResult.HeatmapImageUrl
            };

            var upsertRequest = new
            {
                points = new[]
                {
                    new
                    {
                        id = PointIdHash(pointId),
                        vector = vector,
                        payload = metadata
                    }
                }
            };

            var url = $"{_qdrantUrl}/collections/{_collectionName}/points?wait=true";
            var response = await _httpClient.PutAsJsonAsync(url, upsertRequest);

            if (!response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                _logger.LogError("Failed to store analysis in Qdrant: {Content}", content);
                return string.Empty;
            }

            _logger.LogInformation("Analysis stored in Qdrant for user {UserId}: {AnalysisId}", userId, analysisResult.Id);
            return pointId;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error storing analysis in Qdrant");
            throw;
        }
    }

    public async Task<List<SimilarAnalysisDto>> SearchSimilarAnalysesAsync(string userId, float[] queryVector, int limit = 5)
    {
        await EnsureCollectionInitializedAsync();
        try
        {
            var searchRequest = new
            {
                vector = queryVector,
                limit = limit,
                filter = new
                {
                    must = new[]
                    {
                        new
                        {
                            key = "user_id",
                            match = new { value = userId }
                        }
                    }
                }
            };

            var url = $"{_qdrantUrl}/collections/{_collectionName}/points/search";
            var response = await _httpClient.PostAsJsonAsync(url, searchRequest);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Qdrant search failed for user {UserId}", userId);
                return new List<SimilarAnalysisDto>();
            }

            var content = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(content);
            var root = doc.RootElement;

            var results = new List<SimilarAnalysisDto>();

            if (root.TryGetProperty("result", out var resultArray))
            {
                foreach (var item in resultArray.EnumerateArray())
                {
                    if (!item.TryGetProperty("payload", out var payload))
                        continue;

                    var score = item.TryGetProperty("score", out var scoreEl) ? scoreEl.GetDouble() : 0;

                    results.Add(new SimilarAnalysisDto
                    {
                        AnalysisId = payload.GetProperty("analysis_id").GetString() ?? string.Empty,
                        AnalysisDate = DateTime.Parse(payload.GetProperty("timestamp").GetString() ?? DateTime.UtcNow.ToString("O")),
                        SimilarityScore = score,
                        AcneSeverity = payload.TryGetProperty("acne_severity", out var acneEl) ? acneEl.GetInt32() : 0,
                        RednessSeverity = payload.TryGetProperty("redness_severity", out var rednessEl) ? rednessEl.GetInt32() : 0,
                        UnderEyeBagsSeverity = payload.TryGetProperty("under_eye_bags_severity", out var bagsEl) ? bagsEl.GetInt32() : 0
                    });
                }
            }

            _logger.LogInformation("Found {Count} similar analyses for user {UserId}", results.Count, userId);
            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching similar analyses");
            return new List<SimilarAnalysisDto>();
        }
    }

    public async Task StoreUserContextAsync(string userId, Dictionary<string, string> metadata)
    {
        await EnsureCollectionInitializedAsync();
        try
        {
            var contextVector = new float[8];
            Array.Fill(contextVector, 0.5f); // Neutral baseline

            var payload = new Dictionary<string, object>
            {
                { "user_id", userId },
                { "type", "user_context" },
                { "timestamp", DateTime.UtcNow.ToString("O") }
            };

            foreach (var kv in metadata)
            {
                payload[kv.Key] = kv.Value;
            }

            var upsertRequest = new
            {
                points = new[]
                {
                    new
                    {
                        id = PointIdHash($"{userId}_context"),
                        vector = contextVector,
                        payload = payload
                    }
                }
            };

            var url = $"{_qdrantUrl}/collections/{_collectionName}/points?wait=true";
            var response = await _httpClient.PutAsJsonAsync(url, upsertRequest);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("User context stored in Qdrant for user {UserId}", userId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error storing user context");
        }
    }

    public async Task<List<RecommendationDto>> GenerateRecommendationsAsync(string userId, AnalysisResult currentAnalysis)
    {
        await EnsureCollectionInitializedAsync();
        try
        {
            var recommendations = new List<RecommendationDto>();

            // Acne recommendations
            if (currentAnalysis.AcneSeverity >= 7)
            {
                recommendations.Add(new RecommendationDto
                {
                    Title = "Increase skincare frequency",
                    Description = "Severe acne detected. Consider increasing face wash to twice daily and using salicylic acid products.",
                    Category = "skincare",
                    Priority = 5,
                    Reasoning = $"Acne severity at {currentAnalysis.AcneSeverity}/10 - immediate action recommended"
                });

                recommendations.Add(new RecommendationDto
                {
                    Title = "Schedule dermatologist consultation",
                    Description = "Consider professional treatment options like chemical peels or professional extractions.",
                    Category = "medical",
                    Priority = 5,
                    Reasoning = "Severe acne may require professional intervention"
                });
            }
            else if (currentAnalysis.AcneSeverity >= 4)
            {
                recommendations.Add(new RecommendationDto
                {
                    Title = "Maintain consistent skincare routine",
                    Description = "Use benzoyl peroxide or retinoid products consistently for moderate acne management.",
                    Category = "skincare",
                    Priority = 3,
                    Reasoning = $"Moderate acne ({currentAnalysis.AcneSeverity}/10) - maintain current routine and monitor"
                });
            }

            // Redness recommendations
            if (currentAnalysis.RednessSeverity >= 7)
            {
                recommendations.Add(new RecommendationDto
                {
                    Title = "Use anti-inflammatory products",
                    Description = "Incorporate niacinamide, centella asiatica, or azelaic acid to reduce redness.",
                    Category = "skincare",
                    Priority = 4,
                    Reasoning = $"High redness severity ({currentAnalysis.RednessSeverity}/10) - anti-inflammatory treatment needed"
                });
            }

            // Lifestyle recommendations based on trend
            var similarAnalyses = await SearchSimilarAnalysesAsync(userId, GenerateAnalysisVector(currentAnalysis), 3);

            if (similarAnalyses.Count > 0)
            {
                var avgPreviousAcne = similarAnalyses.Average(x => x.AcneSeverity);
                if (currentAnalysis.AcneSeverity > avgPreviousAcne * 1.2)
                {
                    recommendations.Add(new RecommendationDto
                    {
                        Title = "Check lifestyle factors",
                        Description = "Acne has worsened. Review diet, stress levels, sleep, and hormonal cycle.",
                        Category = "lifestyle",
                        Priority = 3,
                        Reasoning = "Recent acne increase suggests external triggers - investigate lifestyle changes"
                    });
                }
                else if (currentAnalysis.AcneSeverity < avgPreviousAcne * 0.8)
                {
                    recommendations.Add(new RecommendationDto
                    {
                        Title = "Continue current routine",
                        Description = "Great progress! Your skin is improving. Maintain current products and habits.",
                        Category = "skincare",
                        Priority = 1,
                        Reasoning = "Positive trend detected - current approach is working"
                    });
                }
            }

            // General monitoring recommendation
            recommendations.Add(new RecommendationDto
            {
                Title = "Continue daily monitoring",
                Description = "Upload selfies regularly to track progress and catch changes early.",
                Category = "monitoring",
                Priority = 2,
                Reasoning = "Consistent monitoring helps identify patterns and treatment effectiveness"
            });

            _logger.LogInformation("Generated {Count} recommendations for user {UserId}", recommendations.Count, userId);
            return recommendations;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating recommendations");
            return new List<RecommendationDto>();
        }
    }

    public async Task<List<AnalysisVectorDto>> GetUserAnalysisHistoryAsync(string userId)
    {
        await EnsureCollectionInitializedAsync();
        try
        {
            var scrollRequest = new
            {
                filter = new
                {
                    must = new[]
                    {
                        new
                        {
                            key = "user_id",
                            match = new { value = userId }
                        }
                    }
                },
                limit = 100
            };

            var url = $"{_qdrantUrl}/collections/{_collectionName}/points/scroll";
            var response = await _httpClient.PostAsJsonAsync(url, scrollRequest);

            var history = new List<AnalysisVectorDto>();

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;

                if (root.TryGetProperty("result", out var result) && result.TryGetProperty("points", out var points))
                {
                    foreach (var point in points.EnumerateArray())
                    {
                        var vectors = new List<float>();
                        if (point.TryGetProperty("vector", out var vectorEl))
                        {
                            foreach (var v in vectorEl.EnumerateArray())
                            {
                                vectors.Add(v.GetSingle());
                            }
                        }

                        history.Add(new AnalysisVectorDto
                        {
                            Id = point.GetProperty("id").ToString(),
                            Timestamp = DateTime.Parse(point.GetProperty("payload").GetProperty("timestamp").GetString() ?? DateTime.UtcNow.ToString("O")),
                            Vector = vectors.ToArray()
                        });
                    }
                }
            }

            return history;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving user analysis history");
            return new List<AnalysisVectorDto>();
        }
    }

    public async Task DeleteUserDataAsync(string userId)
    {
        await EnsureCollectionInitializedAsync();
        try
        {
            var deleteRequest = new
            {
                filter = new
                {
                    must = new[]
                    {
                        new
                        {
                            key = "user_id",
                            match = new { value = userId }
                        }
                    }
                }
            };

            var url = $"{_qdrantUrl}/collections/{_collectionName}/points/delete";
            var response = await _httpClient.PostAsJsonAsync(url, deleteRequest);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("User data deleted from Qdrant: {UserId}", userId);
            }

            // Also delete from activity log collection
            await EnsureActivityCollectionInitializedAsync();

            var activityDeleteRequest = new
            {
                filter = new
                {
                    must = new[]
                    {
                        new { key = "user_id", match = new { value = userId } }
                    }
                }
            };

            var activityUrl = $"{_qdrantUrl}/collections/{_activityCollectionName}/points/delete";
            var activityResponse = await _httpClient.PostAsJsonAsync(activityUrl, activityDeleteRequest);

            if (activityResponse.IsSuccessStatusCode)
            {
                _logger.LogInformation("Activity log data deleted from Qdrant: {UserId}", userId);
            }
            else
            {
                var activityContent = await activityResponse.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to delete activity log data from Qdrant for user {UserId}: {Content}", userId, activityContent);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting user data from Qdrant");
        }
    }

    /// <summary>
    /// Generates an 8-dimensional vector from analysis scores.
    /// Dimensions: [acne, redness, under_eye_bags, forehead, left_cheek, right_cheek, chin, nose]
    /// Each normalized to 0-1 range.
    /// </summary>
    private static float[] GenerateAnalysisVector(AnalysisResult analysis)
    {
        var vector = new float[8];
        vector[0] = (analysis.AcneSeverity ?? 0) / 10f;
        vector[1] = (analysis.RednessSeverity ?? 0) / 10f;
        vector[2] = (analysis.UnderEyeBagsSeverity ?? 0) / 10f;
        vector[3] = (analysis.ForeheadSeverity ?? 0) / 10f;
        vector[4] = (analysis.LeftCheekSeverity ?? 0) / 10f;
        vector[5] = (analysis.RightCheekSeverity ?? 0) / 10f;
        vector[6] = (analysis.ChinSeverity ?? 0) / 10f;
        vector[7] = (analysis.NoseSeverity ?? 0) / 10f;
        return vector;
    }

    /// <summary>
    /// Converts a string ID to a numeric hash for Qdrant point IDs.
    /// </summary>
    private static ulong PointIdHash(string id)
    {
        var hash = 5381UL;
        foreach (var c in id)
        {
            hash = ((hash << 5) + hash) ^ c;
        }
        return hash;
    }

    public async Task LogActivityEventAsync(string userId, ActivityEvent evt)
    {
        try
        {
            await EnsureActivityCollectionInitializedAsync();

            var text = evt.ToText();
            var vector = await _ollamaEmbeddingService.EmbedAsync(text);

            var payload = new Dictionary<string, object>
            {
                ["user_id"] = userId,
                ["event_type"] = evt.EventType,
                ["timestamp"] = evt.Timestamp.ToString("O"),
                ["date"] = evt.Timestamp.ToString("yyyy-MM-dd"),
                ["text"] = text
            };

            foreach (var kv in evt.ToMetadata())
                payload[kv.Key] = kv.Value;

            var point = new
            {
                id = Guid.NewGuid(),
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
}

