using System.Net.Http.Json;
using System.Text.Json;
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
    private bool _isInitialized = false;
    private readonly SemaphoreSlim _initializationLock = new SemaphoreSlim(1, 1);

    public QdrantService(HttpClient httpClient, ILogger<QdrantService> logger, IConfiguration config)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        
        var host = config["Qdrant:Host"] ?? "qdrant";
        var port = config["Qdrant:Port"] ?? "6333";
        _qdrantUrl = $"http://{host}:{port}";

        // Start initialization in background without blocking startup
        _ = Task.Run(() => EnsureCollectionInitializedAsync());
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

    /// <summary>
    /// Stores user activity events (habit completions, photos, scores) in Qdrant for pattern analysis.
    /// </summary>
    public async Task StoreUserActivityAsync(string userId, string eventType, Dictionary<string, string> eventData)
    {
        try
        {
            await EnsureCollectionInitializedAsync();

            // Create a vector representing the event
            // Event types: habit_completion (1), photo_upload (2), score_update (3)
            var eventTypeValue = eventType switch
            {
                "habit_completion" => 1.0f,
                "photo_upload" => 2.0f,
                "score_update" => 3.0f,
                _ => 0.0f
            };

            // Generate a unique ID for this event
            var eventId = $"{userId}_{eventType}_{DateTime.UtcNow:yyyy-MM-dd-HHmmss}";
            var pointId = PointIdHash(eventId);

            // Create vector with activity data (8 dimensions)
            var vector = new float[8];
            vector[0] = eventTypeValue; // Event type
            
            // Extract numeric values from eventData
            if (eventData.TryGetValue("habit_count", out var habitCount) && int.TryParse(habitCount, out var hc))
                vector[1] = hc / 10f; // Normalize to 0-1
            
            if (eventData.TryGetValue("acne_score", out var acneScore) && float.TryParse(acneScore, out var ac))
                vector[2] = ac;
            
            if (eventData.TryGetValue("redness_score", out var rednessScore) && float.TryParse(rednessScore, out var rc))
                vector[3] = rc;
            
            if (eventData.TryGetValue("overall_score", out var overallScore) && float.TryParse(overallScore, out var os))
                vector[4] = os;
            
            // Fill remaining dimensions with event-specific data
            vector[5] = eventType == "photo_upload" ? 1.0f : 0.0f;
            vector[6] = eventData.ContainsKey("streak_count") && int.TryParse(eventData["streak_count"], out var streak) ? streak / 10f : 0.0f;
            vector[7] = (float)DateTime.UtcNow.TimeOfDay.TotalHours / 24f; // Time of day normalized

            var point = new
            {
                id = pointId,
                vector = vector,
                payload = new
                {
                    user_id = userId,
                    event_type = eventType,
                    timestamp = DateTime.UtcNow.ToString("O"),
                    event_data = eventData
                }
            };

            var url = $"{_qdrantUrl}/collections/{_collectionName}/points";
            var response = await _httpClient.PutAsJsonAsync(url, new { points = new[] { point } });

            if (!response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Failed to store activity in Qdrant: {Content}", content);
            }
            else
            {
                _logger.LogInformation("Activity stored in Qdrant for user {UserId}: {EventType}", userId, eventType);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error storing activity in Qdrant for user {UserId}", userId);
            // Don't throw - activity logging should not block main flow
        }
    }
}

