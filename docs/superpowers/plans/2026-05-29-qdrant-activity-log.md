# Qdrant Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log four user events (quest lock-in, selfie taken, selfie analyzed, recommendations given) to a new `skinprogress_activity_log` Qdrant collection using `bge-m3` text embeddings so the Bloom chatbot can retrieve a user's history via semantic search.

**Architecture:** A new `IOllamaEmbeddingService` generates 1024-dim text embeddings via Ollama. A new `ActivityEvent` discriminated union (4 subtypes) renders each event as human-readable text + structured metadata. `IQdrantService` gets a new `LogActivityEventAsync` method wired as fire-and-forget at each trigger point in `HabitsController`, `PhotoController`, and `UsersController`.

**Tech Stack:** .NET 9, C# records, Moq 4.20, MSTest 3.6, Qdrant REST API, Ollama `/api/embed` (model: `bge-m3:latest`)

**Spec:** `docs/superpowers/specs/2026-05-29-qdrant-activity-log-design.md`

---

## File Map

**Create:**
- `SkinProgress/SkinProgress/Models/ActivityEvents.cs` — sealed base class + 4 event subtypes with `ToText()` / `ToMetadata()`
- `SkinProgress/SkinProgress/Services/Interfaces/IOllamaEmbeddingService.cs` — single `EmbedAsync` method
- `SkinProgress/SkinProgress/Services/OllamaEmbeddingService.cs` — HTTP call to Ollama `/api/embed`
- `SkinProgress/SkinProgress.Tests/ActivityEventTests.cs` — pure unit tests for text rendering
- `SkinProgress/SkinProgress.Tests/OllamaEmbeddingServiceTests.cs` — HttpClient mock tests

**Modify:**
- `SkinProgress/SkinProgress/Services/Interfaces/IQdrantService.cs:57-65` — add `LogActivityEventAsync`
- `SkinProgress/SkinProgress/Services/QdrantService.cs` — new collection init, `LogActivityEventAsync`, extend `DeleteUserDataAsync`, add `IOllamaEmbeddingService` constructor param
- `SkinProgress/SkinProgress/Controllers/HabitsController.cs:110-128` — replace old Qdrant call, add quest lock-in event
- `SkinProgress/SkinProgress/Controllers/PhotoController.cs:53-68` — replace `StoreUserActivityAsync` with `LogActivityEventAsync`
- `SkinProgress/SkinProgress/Controllers/UsersController.cs:863-908` — replace score_update call, add analyzed + recommendations events
- `SkinProgress/SkinProgress/Program.cs:97-98` — register `IOllamaEmbeddingService`
- `SkinProgress/SkinProgress/appsettings.json` — add `Ollama` config block

---

## Task 1: ActivityEvents Model

**Files:**
- Create: `SkinProgress/SkinProgress/Models/ActivityEvents.cs`
- Test: `SkinProgress/SkinProgress.Tests/ActivityEventTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `SkinProgress/SkinProgress.Tests/ActivityEventTests.cs`:

```csharp
using Microsoft.VisualStudio.TestTools.UnitTesting;
using SkinProgress.Models;

namespace SkinProgress.Tests;

[TestClass]
public class ActivityEventTests
{
    [TestMethod]
    public void QuestLockInEvent_ToText_ContainsAllHabitNames()
    {
        var evt = new QuestLockInEvent
        {
            HabitNames = ["Cleanse", "Hydrate", "SPF"],
            Timestamp = new DateTime(2026, 5, 29, 20, 0, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "May 29 2026");
        StringAssert.Contains(text, "Cleanse");
        StringAssert.Contains(text, "Hydrate");
        StringAssert.Contains(text, "SPF");
    }

    [TestMethod]
    public void SelfieTakenEvent_ToText_ContainsDateAndTime()
    {
        var evt = new SelfieTakenEvent
        {
            PhotoId = Guid.NewGuid(),
            CaptureAngles = ["front", "left", "right"],
            Timestamp = new DateTime(2026, 5, 29, 10, 30, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "May 29 2026");
        StringAssert.Contains(text, "10:30");
    }

    [TestMethod]
    public void SelfieAnalyzedEvent_ToText_WithPreviousAnalysis_IncludesDelta()
    {
        var evt = new SelfieAnalyzedEvent
        {
            AnalysisId = Guid.NewGuid(),
            AcneSeverity = 4,
            RednessSeverity = 3,
            UnderEyeBagsSeverity = 2,
            PreviousAcneSeverity = 5,
            Timestamp = new DateTime(2026, 5, 29, 10, 32, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "4/10");
        StringAssert.Contains(text, "3/10");
        StringAssert.Contains(text, "improved");
        StringAssert.Contains(text, "20%");
    }

    [TestMethod]
    public void SelfieAnalyzedEvent_ToText_WithoutPreviousAnalysis_OmitsDelta()
    {
        var evt = new SelfieAnalyzedEvent
        {
            AnalysisId = Guid.NewGuid(),
            AcneSeverity = 4,
            RednessSeverity = 3,
            UnderEyeBagsSeverity = 2,
            PreviousAcneSeverity = null,
            Timestamp = new DateTime(2026, 5, 29, 10, 32, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "4/10");
        Assert.IsFalse(text.Contains("improved") || text.Contains("worsened"),
            "Delta sentence should be omitted when no prior analysis");
    }

    [TestMethod]
    public void RecommendationsGivenEvent_ToText_ContainsTitles()
    {
        var evt = new RecommendationsGivenEvent
        {
            RecommendationTitles = ["Maintain routine", "Use niacinamide"],
            RecommendationCategories = ["skincare", "skincare"],
            LinkedAnalysisId = Guid.NewGuid().ToString(),
            Timestamp = new DateTime(2026, 5, 29, 10, 33, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "May 29 2026");
        StringAssert.Contains(text, "maintain routine");
        StringAssert.Contains(text, "use niacinamide");
    }

    [TestMethod]
    public void AllEvents_EventType_MatchesSpec()
    {
        Assert.AreEqual("daily_quest_lock_in",
            new QuestLockInEvent { HabitNames = [], Timestamp = DateTime.UtcNow }.EventType);
        Assert.AreEqual("selfie_taken",
            new SelfieTakenEvent { PhotoId = Guid.NewGuid(), CaptureAngles = [], Timestamp = DateTime.UtcNow }.EventType);
        Assert.AreEqual("selfie_analyzed",
            new SelfieAnalyzedEvent { AnalysisId = Guid.NewGuid(), AcneSeverity = 0, RednessSeverity = 0, UnderEyeBagsSeverity = 0, Timestamp = DateTime.UtcNow }.EventType);
        Assert.AreEqual("recommendations_given",
            new RecommendationsGivenEvent { RecommendationTitles = [], RecommendationCategories = [], LinkedAnalysisId = "", Timestamp = DateTime.UtcNow }.EventType);
    }

    [TestMethod]
    public void SelfieAnalyzedEvent_ToMetadata_ContainsAllScores()
    {
        var id = Guid.NewGuid();
        var evt = new SelfieAnalyzedEvent
        {
            AnalysisId = id,
            AcneSeverity = 4,
            RednessSeverity = 3,
            UnderEyeBagsSeverity = 2,
            Timestamp = DateTime.UtcNow
        };

        var meta = evt.ToMetadata();

        Assert.AreEqual(id.ToString(), meta["analysis_id"]);
        Assert.AreEqual(4, meta["acne_severity"]);
        Assert.AreEqual(3, meta["redness_severity"]);
        Assert.AreEqual(2, meta["under_eye_bags_severity"]);
    }
}
```

- [ ] **Step 2: Run tests — confirm they fail (class not found)**

```
cd SkinProgress
dotnet test SkinProgress.Tests --filter "ClassName=ActivityEventTests" -v q
```

Expected: Build error — `QuestLockInEvent`, `SelfieTakenEvent`, etc. not defined.

- [ ] **Step 3: Create `SkinProgress/SkinProgress/Models/ActivityEvents.cs`**

```csharp
namespace SkinProgress.Models;

public abstract class ActivityEvent
{
    public required DateTime Timestamp { get; init; }
    public abstract string EventType { get; }
    public abstract string ToText();
    public abstract Dictionary<string, object> ToMetadata();
}

public class QuestLockInEvent : ActivityEvent
{
    public required string[] HabitNames { get; init; }

    public override string EventType => "daily_quest_lock_in";

    public override string ToText() =>
        $"User locked in their daily quest on {Timestamp:MMMM d yyyy}. " +
        $"Habits completed and permanently locked: {string.Join(", ", HabitNames)}.";

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["quest_date"] = Timestamp.ToString("yyyy-MM-dd"),
        ["habit_names"] = HabitNames,
        ["locked_habit_count"] = HabitNames.Length
    };
}

public class SelfieTakenEvent : ActivityEvent
{
    public required Guid PhotoId { get; init; }
    public required string[] CaptureAngles { get; init; }

    public override string EventType => "selfie_taken";

    public override string ToText() =>
        $"User took a selfie set on {Timestamp:MMMM d yyyy} at {Timestamp:h:mm tt}.";

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["photo_id"] = PhotoId.ToString(),
        ["capture_angles"] = CaptureAngles
    };
}

public class SelfieAnalyzedEvent : ActivityEvent
{
    public required Guid AnalysisId { get; init; }
    public required int AcneSeverity { get; init; }
    public required int RednessSeverity { get; init; }
    public required int UnderEyeBagsSeverity { get; init; }
    public int? ForeheadSeverity { get; init; }
    public int? LeftCheekSeverity { get; init; }
    public int? RightCheekSeverity { get; init; }
    public int? ChinSeverity { get; init; }
    public int? NoseSeverity { get; init; }
    public int? PreviousAcneSeverity { get; init; }

    public override string EventType => "selfie_analyzed";

    public override string ToText()
    {
        var text = $"User's skin was analyzed on {Timestamp:MMMM d yyyy}. " +
                   $"Acne severity {AcneSeverity}/10, redness {RednessSeverity}/10, " +
                   $"under-eye bags {UnderEyeBagsSeverity}/10.";

        if (PreviousAcneSeverity.HasValue && PreviousAcneSeverity.Value > 0)
        {
            var deltaPct = ((AcneSeverity - PreviousAcneSeverity.Value) / (double)PreviousAcneSeverity.Value) * 100;
            var direction = deltaPct < 0 ? "improved" : "worsened";
            text += $" Acne {direction} {Math.Abs(deltaPct):F0}% vs the previous analysis.";
        }

        return text;
    }

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["analysis_id"] = AnalysisId.ToString(),
        ["acne_severity"] = AcneSeverity,
        ["redness_severity"] = RednessSeverity,
        ["under_eye_bags_severity"] = UnderEyeBagsSeverity,
        ["forehead_severity"] = ForeheadSeverity ?? 0,
        ["left_cheek_severity"] = LeftCheekSeverity ?? 0,
        ["right_cheek_severity"] = RightCheekSeverity ?? 0,
        ["chin_severity"] = ChinSeverity ?? 0,
        ["nose_severity"] = NoseSeverity ?? 0
    };
}

public class RecommendationsGivenEvent : ActivityEvent
{
    public required string[] RecommendationTitles { get; init; }
    public required string[] RecommendationCategories { get; init; }
    public required string LinkedAnalysisId { get; init; }

    public override string EventType => "recommendations_given";

    public override string ToText()
    {
        var titles = string.Join(", ", RecommendationTitles.Take(3).Select(t => t.ToLower()));
        return $"New skincare recommendations given on {Timestamp:MMMM d yyyy}: {titles}.";
    }

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["recommendation_titles"] = RecommendationTitles,
        ["recommendation_categories"] = RecommendationCategories,
        ["recommendation_count"] = RecommendationTitles.Length,
        ["linked_analysis_id"] = LinkedAnalysisId
    };
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```
cd SkinProgress
dotnet test SkinProgress.Tests --filter "ClassName=ActivityEventTests" -v q
```

Expected:
```
Passed!  - Failed: 0, Passed: 7, Skipped: 0
```

- [ ] **Step 5: Commit**

```
git add SkinProgress/SkinProgress/Models/ActivityEvents.cs SkinProgress/SkinProgress.Tests/ActivityEventTests.cs
git commit -m "feat: add ActivityEvent model with 4 event subtypes and text rendering"
```

---

## Task 2: OllamaEmbeddingService

**Files:**
- Create: `SkinProgress/SkinProgress/Services/Interfaces/IOllamaEmbeddingService.cs`
- Create: `SkinProgress/SkinProgress/Services/OllamaEmbeddingService.cs`
- Test: `SkinProgress/SkinProgress.Tests/OllamaEmbeddingServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `SkinProgress/SkinProgress.Tests/OllamaEmbeddingServiceTests.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using Moq.Protected;
using SkinProgress.Services;
using System.Net;
using System.Text;
using System.Text.Json;

namespace SkinProgress.Tests;

[TestClass]
public class OllamaEmbeddingServiceTests
{
    private Mock<HttpMessageHandler> _mockHandler = null!;
    private HttpClient _httpClient = null!;
    private Mock<IConfiguration> _mockConfig = null!;
    private Mock<ILogger<OllamaEmbeddingService>> _mockLogger = null!;

    [TestInitialize]
    public void Setup()
    {
        _mockHandler = new Mock<HttpMessageHandler>();
        _httpClient = new HttpClient(_mockHandler.Object);
        _mockConfig = new Mock<IConfiguration>();
        _mockLogger = new Mock<ILogger<OllamaEmbeddingService>>();

        _mockConfig.Setup(c => c["Ollama:Host"]).Returns("localhost");
        _mockConfig.Setup(c => c["Ollama:Port"]).Returns("11434");
        _mockConfig.Setup(c => c["Ollama:EmbeddingModel"]).Returns("bge-m3:latest");
    }

    [TestMethod]
    public async Task EmbedAsync_ReturnsFloatArrayFromOllamaResponse()
    {
        // Arrange
        var ollamaJson = JsonSerializer.Serialize(new
        {
            embeddings = new[] { new[] { 0.1f, 0.2f, 0.3f } }
        });

        _mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(ollamaJson, Encoding.UTF8, "application/json")
            });

        var service = new OllamaEmbeddingService(_httpClient, _mockConfig.Object, _mockLogger.Object);

        // Act
        var result = await service.EmbedAsync("test input text");

        // Assert
        Assert.AreEqual(3, result.Length);
        Assert.AreEqual(0.1f, result[0], 0.001f);
        Assert.AreEqual(0.2f, result[1], 0.001f);
        Assert.AreEqual(0.3f, result[2], 0.001f);
    }

    [TestMethod]
    public async Task EmbedAsync_SendsCorrectModelInRequestBody()
    {
        // Arrange
        HttpRequestMessage? capturedRequest = null;
        var ollamaJson = JsonSerializer.Serialize(new
        {
            embeddings = new[] { new[] { 0.5f } }
        });

        _mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(ollamaJson, Encoding.UTF8, "application/json")
            });

        var service = new OllamaEmbeddingService(_httpClient, _mockConfig.Object, _mockLogger.Object);

        // Act
        await service.EmbedAsync("hello");

        // Assert
        Assert.IsNotNull(capturedRequest);
        Assert.AreEqual(HttpMethod.Post, capturedRequest.Method);
        var body = await capturedRequest.Content!.ReadAsStringAsync();
        StringAssert.Contains(body, "bge-m3:latest");
        StringAssert.Contains(body, "hello");
    }

    [TestMethod]
    [ExpectedException(typeof(HttpRequestException))]
    public async Task EmbedAsync_ThrowsWhenOllamaReturnsError()
    {
        // Arrange
        _mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.ServiceUnavailable,
                Content = new StringContent("unavailable")
            });

        var service = new OllamaEmbeddingService(_httpClient, _mockConfig.Object, _mockLogger.Object);

        // Act — throws
        await service.EmbedAsync("hello");
    }
}
```

- [ ] **Step 2: Run tests — confirm they fail (class not found)**

```
cd SkinProgress
dotnet test SkinProgress.Tests --filter "ClassName=OllamaEmbeddingServiceTests" -v q
```

Expected: Build error — `OllamaEmbeddingService` not defined.

- [ ] **Step 3: Create `SkinProgress/SkinProgress/Services/Interfaces/IOllamaEmbeddingService.cs`**

```csharp
namespace SkinProgress.Services.Interfaces;

public interface IOllamaEmbeddingService
{
    Task<float[]> EmbedAsync(string text);
}
```

- [ ] **Step 4: Create `SkinProgress/SkinProgress/Services/OllamaEmbeddingService.cs`**

```csharp
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
```

- [ ] **Step 5: Run tests — confirm they pass**

```
cd SkinProgress
dotnet test SkinProgress.Tests --filter "ClassName=OllamaEmbeddingServiceTests" -v q
```

Expected:
```
Passed!  - Failed: 0, Passed: 3, Skipped: 0
```

- [ ] **Step 6: Commit**

```
git add SkinProgress/SkinProgress/Services/Interfaces/IOllamaEmbeddingService.cs \
        SkinProgress/SkinProgress/Services/OllamaEmbeddingService.cs \
        SkinProgress/SkinProgress.Tests/OllamaEmbeddingServiceTests.cs
git commit -m "feat: add OllamaEmbeddingService for bge-m3 text embeddings"
```

---

## Task 3: Extend QdrantService

**Files:**
- Modify: `SkinProgress/SkinProgress/Services/Interfaces/IQdrantService.cs`
- Modify: `SkinProgress/SkinProgress/Services/QdrantService.cs`

- [ ] **Step 1: Add `LogActivityEventAsync` to `IQdrantService.cs`**

In `SkinProgress/SkinProgress/Services/Interfaces/IQdrantService.cs`, add after the existing `StoreUserActivityAsync` declaration (after line 64):

```csharp
    /// <summary>
    /// Logs a structured user activity event to the skinprogress_activity_log collection.
    /// Embeds the event text via Ollama bge-m3 for semantic retrieval by Bloom chatbot.
    /// Fire-and-forget — swallows exceptions so it never blocks callers.
    /// </summary>
    Task LogActivityEventAsync(string userId, ActivityEvent evt);
```

Also add the using at the top of the file (it's in the same project so just need the namespace):
```csharp
using SkinProgress.Models;
```

- [ ] **Step 2: Update `QdrantService.cs` — add field, update constructor, add collection init**

In `SkinProgress/SkinProgress/Services/QdrantService.cs`:

**2a.** After the existing `_collectionName` field (line 18), add:

```csharp
    private readonly string _activityCollectionName = "skinprogress_activity_log";
    private readonly IOllamaEmbeddingService _ollamaEmbeddingService;
    private bool _isActivityCollectionInitialized = false;
    private readonly SemaphoreSlim _activityInitLock = new SemaphoreSlim(1, 1);
```

**2b.** Update the constructor signature (line 21) to inject `IOllamaEmbeddingService`:

```csharp
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
```

**2c.** Add the activity collection initializer method after the existing `InitializeCollectionAsync` method (after line 120):

```csharp
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
    }
```

- [ ] **Step 3: Implement `LogActivityEventAsync` in `QdrantService.cs`**

Add after `StoreUserActivityAsync` (after line 605):

```csharp
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
```

Also add `using SkinProgress.Models;` to the top of `QdrantService.cs`.

- [ ] **Step 4: Extend `DeleteUserDataAsync` to cover the activity log collection**

In `QdrantService.cs`, inside `DeleteUserDataAsync` (around line 463-494), after the existing delete call, add:

```csharp
            // Also delete from activity log collection
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
```

- [ ] **Step 5: Build to confirm no compile errors**

```
cd SkinProgress
dotnet build SkinProgress/SkinProgress.csproj -v q
```

Expected: `Build succeeded.`

- [ ] **Step 6: Commit**

```
git add SkinProgress/SkinProgress/Services/Interfaces/IQdrantService.cs \
        SkinProgress/SkinProgress/Services/QdrantService.cs
git commit -m "feat: add LogActivityEventAsync to QdrantService with skinprogress_activity_log collection"
```

---

## Task 4: Register Services + Config

**Files:**
- Modify: `SkinProgress/SkinProgress/Program.cs`
- Modify: `SkinProgress/SkinProgress/appsettings.json`

- [ ] **Step 1: Register `IOllamaEmbeddingService` in `Program.cs`**

In `SkinProgress/SkinProgress/Program.cs`, after line 98 (`builder.Services.AddHttpClient<IQdrantService, QdrantService>();`), add:

```csharp
builder.Services.AddHttpClient<IOllamaEmbeddingService, OllamaEmbeddingService>();
```

Also add the using at the top if not already present:
```csharp
using SkinProgress.Services.Interfaces;
```

- [ ] **Step 2: Add Ollama config to `appsettings.json`**

In `SkinProgress/SkinProgress/appsettings.json`, add after the `"Qdrant"` block:

```json
  "Ollama": {
    "Host": "ollama",
    "Port": "11434",
    "EmbeddingModel": "bge-m3:latest"
  }
```

Full `appsettings.json` after change:
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=SkinProgressDb;Username=postgres;Password=yourpassword"
  },
  "Jwt": {
    "Key": "ThisIsASecretKeyForJwtTokenGenerationAndItShouldBeLongEnough",
    "Issuer": "SkinProgressApi",
    "Audience": "SkinProgressClient"
  },
  "Google": {
    "ClientId": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
  },
  "AiService": {
    "BaseUrl": "http://localhost:8001"
  },
  "Qdrant": {
    "Host": "qdrant",
    "Port": "6333",
    "ApiKey": ""
  },
  "Ollama": {
    "Host": "ollama",
    "Port": "11434",
    "EmbeddingModel": "bge-m3:latest"
  }
}
```

- [ ] **Step 3: Build to confirm DI wires up**

```
cd SkinProgress
dotnet build SkinProgress/SkinProgress.csproj -v q
```

Expected: `Build succeeded.`

- [ ] **Step 4: Commit**

```
git add SkinProgress/SkinProgress/Program.cs SkinProgress/SkinProgress/appsettings.json
git commit -m "feat: register OllamaEmbeddingService and add Ollama config"
```

---

## Task 5: Wire HabitsController — daily_quest_lock_in

**Files:**
- Modify: `SkinProgress/SkinProgress/Controllers/HabitsController.cs`

The `daily_quest_lock_in` event fires when a `CompleteHabit` call pushes today's completions to equal the total number of default habits (i.e., the last habit was just completed). This reuses the existing endpoint without any frontend change.

- [ ] **Step 1: Replace the old Qdrant call in `CompleteHabit` (lines 110–128)**

Replace the entire `try` block starting at line 110 (`// Store habit completion activity in Qdrant`) with:

```csharp
        // Fire daily_quest_lock_in event only when this call completes the final habit
        if (existingCompletion == null)
        {
            try
            {
                var todayCompletions = await _context.HabitCompletions
                    .Where(hc => hc.UserId == userId && hc.Date.Date == today)
                    .Include(hc => hc.HabitDefinition)
                    .ToListAsync();

                var defaultHabitCount = await _context.HabitDefinitions.CountAsync(h => h.IsDefault);

                if (todayCompletions.Count >= defaultHabitCount)
                {
                    var habitNames = todayCompletions
                        .Select(c => c.HabitDefinition?.Name ?? "Unknown")
                        .ToArray();

                    _ = Task.Run(async () => await _qdrantService.LogActivityEventAsync(
                        userId.ToString(),
                        new QuestLockInEvent
                        {
                            HabitNames = habitNames,
                            Timestamp = DateTime.UtcNow
                        }
                    ));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error logging quest lock-in event");
            }
        }
```

Also add these usings at the top of `HabitsController.cs` if not present:
```csharp
using SkinProgress.Models;
using Microsoft.Extensions.Logging;
```

And inject `ILogger` — update the constructor:
```csharp
    private readonly ILogger<HabitsController> _logger;

    public HabitsController(AppDbContext context, IQdrantService qdrantService, ILogger<HabitsController> logger)
    {
        _context = context;
        _qdrantService = qdrantService;
        _logger = logger;
    }
```

- [ ] **Step 2: Build to confirm**

```
cd SkinProgress
dotnet build SkinProgress/SkinProgress.csproj -v q
```

Expected: `Build succeeded.`

- [ ] **Step 3: Commit**

```
git add SkinProgress/SkinProgress/Controllers/HabitsController.cs
git commit -m "feat: fire daily_quest_lock_in Qdrant event when all habits completed"
```

---

## Task 6: Wire PhotoController — selfie_taken

**Files:**
- Modify: `SkinProgress/SkinProgress/Controllers/PhotoController.cs`

- [ ] **Step 1: Replace `StoreUserActivityAsync` call with `LogActivityEventAsync` (lines 53–68)**

Replace the existing `try` block (lines 53–68) inside `UploadPhoto`:

```csharp
            _ = Task.Run(async () =>
            {
                try
                {
                    await _qdrantService.LogActivityEventAsync(
                        userId.ToString(),
                        new SelfieTakenEvent
                        {
                            PhotoId = result.PhotoId,
                            CaptureAngles = [result.ViewType ?? "front"],
                            Timestamp = DateTime.UtcNow
                        }
                    );
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error logging selfie_taken event");
                }
            });
```

Also add the using at the top of `PhotoController.cs`:
```csharp
using SkinProgress.Models;
```

- [ ] **Step 2: Build to confirm**

```
cd SkinProgress
dotnet build SkinProgress/SkinProgress.csproj -v q
```

Expected: `Build succeeded.`

- [ ] **Step 3: Commit**

```
git add SkinProgress/SkinProgress/Controllers/PhotoController.cs
git commit -m "feat: fire selfie_taken Qdrant event on photo upload"
```

---

## Task 7: Wire UsersController — selfie_analyzed + recommendations_given

**Files:**
- Modify: `SkinProgress/SkinProgress/Controllers/UsersController.cs`

The trigger point is `SaveAnalysisHeatmapAsync`. We query the previous `AnalysisResult` before saving the new one (to compute the acne delta), then fire both events after save.

- [ ] **Step 1: Add previous analysis query before the `_context.AnalysisResults.Add` call (before line 891)**

Insert this block right before `_context.AnalysisResults.Add(analysisResult);` (line 891):

```csharp
            // Query previous analysis before saving new one (needed for acne delta in text)
            var previousAnalysis = await _context.AnalysisResults
                .Where(ar => ar.UserId == userId.ToString() && ar.Status == "Completed")
                .OrderByDescending(ar => ar.Timestamp)
                .FirstOrDefaultAsync();
```

- [ ] **Step 2: Replace the old Qdrant calls (lines 894–908)**

Replace the inner `try` block (lines 894–913 — from `try` to the `catch` that logs `"Qdrant storage error"`) with:

```csharp
            try
            {
                await _qdrantService.StoreAnalysisAsync(userId.ToString(), analysisResult);

                _ = Task.Run(async () => await _qdrantService.LogActivityEventAsync(
                    userId.ToString(),
                    new SelfieAnalyzedEvent
                    {
                        AnalysisId = analysisResult.Id,
                        AcneSeverity = analysisResult.AcneSeverity ?? 0,
                        RednessSeverity = analysisResult.RednessSeverity ?? 0,
                        UnderEyeBagsSeverity = analysisResult.UnderEyeBagsSeverity ?? 0,
                        PreviousAcneSeverity = previousAnalysis?.AcneSeverity,
                        Timestamp = analysisResult.Timestamp
                    }
                ));

                var recommendations = await _qdrantService.GenerateRecommendationsAsync(userId.ToString(), analysisResult);
                Console.WriteLine($"Generated {recommendations.Count} recommendations for user {userId}");

                if (recommendations.Count > 0)
                {
                    _ = Task.Run(async () => await _qdrantService.LogActivityEventAsync(
                        userId.ToString(),
                        new RecommendationsGivenEvent
                        {
                            RecommendationTitles = recommendations.Select(r => r.Title).ToArray(),
                            RecommendationCategories = recommendations.Select(r => r.Category).ToArray(),
                            LinkedAnalysisId = analysisResult.Id.ToString(),
                            Timestamp = DateTime.UtcNow
                        }
                    ));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Qdrant storage error (non-blocking): {ex.Message}");
            }
```

Also add the using at the top of `UsersController.cs`:
```csharp
using SkinProgress.Models;
```

- [ ] **Step 3: Build to confirm**

```
cd SkinProgress
dotnet build SkinProgress/SkinProgress.csproj -v q
```

Expected: `Build succeeded.`

- [ ] **Step 4: Run all tests to confirm nothing is broken**

```
cd SkinProgress
dotnet test -v q
```

Expected:
```
Passed!  - Failed: 0, Passed: [N], Skipped: 0
```

- [ ] **Step 5: Commit**

```
git add SkinProgress/SkinProgress/Controllers/UsersController.cs
git commit -m "feat: fire selfie_analyzed and recommendations_given Qdrant events after analysis"
```

---

## Self-Review Checklist

After all tasks complete, verify:

- [ ] `dotnet build SkinProgress/SkinProgress.csproj` — no warnings or errors
- [ ] `dotnet test SkinProgress.Tests` — all tests pass
- [ ] `skinprogress_activity_log` collection uses vector size 1024 (bge-m3)
- [ ] Every `LogActivityEventAsync` call is fire-and-forget (wrapped in `_ = Task.Run(...)` or is itself non-throwing)
- [ ] `DeleteUserDataAsync` deletes from both collections
- [ ] All four event types have their `EventType` string matching the spec exactly: `daily_quest_lock_in`, `selfie_taken`, `selfie_analyzed`, `recommendations_given`
- [ ] `user_id` is always sourced from JWT claim, never from request body
