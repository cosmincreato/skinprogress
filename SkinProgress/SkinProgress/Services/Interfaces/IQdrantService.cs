using SkinProgress.Models;
using SkinProgress.Models.Entities;

namespace SkinProgress.Services.Interfaces;

/// <summary>
/// Interface for Qdrant vector database operations.
/// Handles storage and retrieval of user skin analysis data for RAG pipeline.
/// </summary>
public interface IQdrantService
{
    /// <summary>
    /// Stores analysis results and user metadata as vectors in Qdrant.
    /// Called after analysis completion to populate knowledge base for recommendations.
    /// </summary>
    /// <param name="userId">User unique identifier</param>
    /// <param name="analysisResult">Completed analysis result with severity scores</param>
    /// <returns>Point ID from Qdrant</returns>
    Task<string> StoreAnalysisAsync(string userId, AnalysisResult analysisResult);

    /// <summary>
    /// Retrieves similar past analyses for a user based on current symptoms.
    /// Used for recommendation generation and pattern detection.
    /// </summary>
    /// <param name="userId">User unique identifier</param>
    /// <param name="queryVector">Embedding vector representing current analysis</param>
    /// <param name="limit">Maximum similar results to return (default 5)</param>
    /// <returns>List of similar analysis records with similarity scores</returns>
    Task<List<SimilarAnalysisDto>> SearchSimilarAnalysesAsync(string userId, float[] queryVector, int limit = 5);

    /// <summary>
    /// Stores user preferences, habits, and lifestyle data for context-aware recommendations.
    /// </summary>
    /// <param name="userId">User unique identifier</param>
    /// <param name="metadata">Key-value pairs: habit_frequency, skincare_routine, diet_notes, stress_level, sleep_hours, etc.</param>
    Task StoreUserContextAsync(string userId, Dictionary<string, string> metadata);

    /// <summary>
    /// Generates personalized recommendations based on historical data and current trends.
    /// </summary>
    /// <param name="userId">User unique identifier</param>
    /// <param name="currentAnalysis">Latest analysis result</param>
    /// <returns>List of recommendations with reasoning</returns>
    Task<List<RecommendationDto>> GenerateRecommendationsAsync(string userId, AnalysisResult currentAnalysis);

    /// <summary>
    /// Retrieves all user analysis data for export/backup.
    /// </summary>
    /// <param name="userId">User unique identifier</param>
    /// <returns>All stored analysis vectors for the user</returns>
    Task<List<AnalysisVectorDto>> GetUserAnalysisHistoryAsync(string userId);

    /// <summary>
    /// Deletes all user data from Qdrant (GDPR compliance).
    /// </summary>
    /// <param name="userId">User unique identifier</param>
    Task DeleteUserDataAsync(string userId);

    /// <summary>
    /// Stores user activity events (habit completions, photos, scores) in Qdrant for pattern analysis.
    /// </summary>
    /// <param name="userId">User unique identifier</param>
    /// <param name="eventType">Type of event: habit_completion, photo_upload, score_update</param>
    /// <param name="eventData">Event metadata and values</param>
    Task StoreUserActivityAsync(string userId, string eventType, Dictionary<string, string> eventData);

    /// <summary>
    /// Logs a structured user activity event to the skinprogress_activity_log collection.
    /// Embeds the event text via Ollama bge-m3 for semantic retrieval by Bloom chatbot.
    /// Fire-and-forget — swallows exceptions so it never blocks callers.
    /// </summary>
    Task LogActivityEventAsync(string userId, ActivityEvent evt);
}

/// <summary>
/// DTO for similar analysis results from Qdrant search.
/// </summary>
public class SimilarAnalysisDto
{
    public string AnalysisId { get; set; } = string.Empty;
    public DateTime AnalysisDate { get; set; }
    public double SimilarityScore { get; set; } // 0-1, higher = more similar
    public int AcneSeverity { get; set; }
    public int RednessSeverity { get; set; }
    public int UnderEyeBagsSeverity { get; set; }
}

/// <summary>
/// DTO for personalized recommendations.
/// </summary>
public class RecommendationDto
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty; // "skincare", "lifestyle", "medical", "monitoring"
    public int Priority { get; set; } // 1-5, higher = more urgent
    public string Reasoning { get; set; } = string.Empty; // Explanation based on analysis
}

/// <summary>
/// DTO for analysis vectors stored in Qdrant.
/// </summary>
public class AnalysisVectorDto
{
    public string Id { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public float[] Vector { get; set; } = Array.Empty<float>();
    public Dictionary<string, object> Metadata { get; set; } = new();
}
