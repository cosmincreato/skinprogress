using SkinProgress.Models;

namespace SkinProgress.Services.Interfaces;

public interface IQdrantService
{
    /// <summary>
    /// Logs a structured user activity event to the skinprogress_activity_log collection.
    /// Text is stored in payload for future RAG retrieval. Vector is a zero placeholder
    /// until the n8n embedding pipeline is ready.
    /// Fire-and-forget — swallows exceptions so it never blocks callers.
    /// </summary>
    Task LogActivityEventAsync(string userId, ActivityEvent evt);

    /// <summary>
    /// Deletes all user data from Qdrant (GDPR compliance).
    /// </summary>
    Task DeleteUserDataAsync(string userId);
}
