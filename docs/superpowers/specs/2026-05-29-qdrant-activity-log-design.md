# Qdrant Activity Log for Bloom Chatbot

**Date:** 2026-05-29
**Status:** Approved

## Overview

A user activity logging system that writes specific user events to a dedicated Qdrant collection so that the Bloom chatbot (n8n webhook) can accurately retrieve a user's historical data when they ask about themselves.

The four events logged are: daily quest lock-in, selfie taken, selfie analyzed (with scores), and new recommendations given.

---

## Collection Layout

Two collections serve different purposes and must stay separate — they have incompatible vector dimensions and different query patterns.

| Collection | Vector Dimensions | Model | Purpose |
|---|---|---|---|
| `skinprogress_analyses` | 8-dim numeric | n/a (score-derived) | Existing. Skin score similarity search for recommendation engine |
| `skinprogress_activity_log` | 1024-dim text embedding | `bge-m3:latest` (Ollama) | New. Bloom chatbot retrieval — what happened, when, and what scores |

The existing `skinprogress_analyses` collection is untouched.

---

## Payload Schema

Every point in `skinprogress_activity_log` uses a **hybrid design**: a natural language `text` field that gets embedded for semantic search, plus structured metadata fields for exact filtering.

```json
{
  "id": "<Guid.NewGuid() — random UUID generated at write time>",
  "vector": ["/* 1024-dim bge-m3 embedding of the text field */"],
  "payload": {
    "user_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "event_type": "selfie_analyzed",
    "timestamp": "2026-05-29T10:32:00Z",
    "date": "2026-05-29",
    "text": "User's skin was analyzed on May 29 2026. Acne severity 4/10, redness 3/10, under-eye bags 2/10. Acne improved 20% vs the previous analysis.",
    "acne_severity": 4,
    "redness_severity": 3,
    "under_eye_bags_severity": 2,
    "forehead_severity": 3,
    "left_cheek_severity": 2,
    "right_cheek_severity": 3,
    "chin_severity": 4,
    "nose_severity": 1,
    "analysis_id": "ana_xyz789"
  }
}
```

The `text` field is what Bloom reads as LLM context. The numeric/string fields give n8n precise filtering capability on top of semantic search.

---

## Event Type Specifications

### `daily_quest_lock_in`
Triggered when a user locks in their daily quest.

```json
{
  "event_type": "daily_quest_lock_in",
  "timestamp": "2026-05-29T20:15:00Z",
  "date": "2026-05-29",
  "text": "User locked in their daily quest on May 29 2026. Habits completed and permanently locked: Cleanse, Hydrate, SPF.",
  "quest_date": "2026-05-29",
  "habit_names": ["Cleanse", "Hydrate", "SPF"],
  "locked_habit_count": 3
}
```

### `selfie_taken`
Triggered when a selfie set is uploaded.

```json
{
  "event_type": "selfie_taken",
  "timestamp": "2026-05-29T10:30:00Z",
  "date": "2026-05-29",
  "text": "User took a selfie set on May 29 2026 at 10:30 AM.",
  "photo_id": "photo_abc",
  "capture_angles": ["front", "left", "right"]
}
```

### `selfie_analyzed`
Triggered after AI analysis completes and `AnalysisResult` is persisted to SQL. Includes all zone scores. The `text` field includes an acne delta sentence only when a prior `AnalysisResult` exists for the user — the builder queries the most recent previous result from SQL to compute the percentage change. If no prior result exists, the delta sentence is omitted.

```json
{
  "event_type": "selfie_analyzed",
  "timestamp": "2026-05-29T10:32:00Z",
  "date": "2026-05-29",
  "text": "User's skin was analyzed on May 29 2026. Acne severity 4/10, redness 3/10, under-eye bags 2/10. Acne improved 20% vs the previous analysis.",
  "analysis_id": "ana_xyz789",
  "acne_severity": 4,
  "redness_severity": 3,
  "under_eye_bags_severity": 2,
  "forehead_severity": 3,
  "left_cheek_severity": 2,
  "right_cheek_severity": 3,
  "chin_severity": 4,
  "nose_severity": 1
}
```

### `recommendations_given`
Triggered immediately after `GenerateRecommendationsAsync` runs post-analysis. Source of truth is the backend recommendation engine, not the frontend care tab.

```json
{
  "event_type": "recommendations_given",
  "timestamp": "2026-05-29T10:32:05Z",
  "date": "2026-05-29",
  "text": "New skincare recommendations given on May 29 2026: maintain consistent routine for moderate acne, use anti-inflammatory products for redness severity 7.",
  "recommendation_titles": ["Maintain consistent skincare routine", "Use anti-inflammatory products"],
  "recommendation_categories": ["skincare", "skincare"],
  "recommendation_count": 2,
  "linked_analysis_id": "ana_xyz789"
}
```

> **Follow-up task (out of scope for this spec):** Unify frontend and backend recommendation logic. The frontend `GalleryPage.tsx` currently computes recommendations client-side via `useMemo`. It should eventually call a backend endpoint to retrieve backend-generated recommendations instead.

---

## Multi-Tenancy Strategy

`user_id` is the tenant key. It is written on every point from the JWT claim (`User.FindFirst(ClaimTypes.NameIdentifier)`) — never from the request body, so it cannot be spoofed.

**All Qdrant reads must include a `user_id` must-filter as the first clause:**

```json
{
  "filter": {
    "must": [
      { "key": "user_id", "match": { "value": "3fa85f64-5717-4562-b3fc-2c963f66afa6" } }
    ]
  },
  "vector": ["/* embedded question */"],
  "limit": 10
}
```

Bloom never queries `skinprogress_activity_log` without this filter. The `user_id` is passed from `ChatbotWidget` in the n8n webhook payload alongside the chat message.

GDPR deletion: same filter pattern as `DeleteUserDataAsync`, extended to cover `skinprogress_activity_log`.

---

## Embedding Flow

```
Event triggered in Controller or Service
        ↓
Build natural language text string (event-type-specific)
        ↓
POST to Ollama /api/embed  { "model": "bge-m3:latest", "input": "<text>" }
        ↓
Receive float[1024] vector
        ↓
PUT to Qdrant /collections/skinprogress_activity_log/points  { vector, payload }
        ↓
Fire-and-forget — does not block the API response
```

Ollama is already running on the Docker network at the same host the n8n workflow uses. The backend reuses its existing `HttpClient` infrastructure (same pattern as `QdrantService.cs` Qdrant calls).

### New backend components

**`IOllamaEmbeddingService`** — injectable service responsible for calling Ollama `/api/embed` and returning `float[]`. Kept separate from `QdrantService` so it can be mocked in tests.

**`IQdrantService.LogActivityEventAsync(string userId, ActivityEvent evt)`** — new method on the existing interface. `ActivityEvent` is a discriminated union (sealed base class with 4 concrete subtypes) where each subtype knows how to render its own `text` string and its own metadata dictionary.

**`ActivityEvent` subtypes:**
- `QuestLockInEvent`
- `SelfieTakenEvent`
- `SelfieAnalyzedEvent`
- `RecommendationsGivenEvent`

---

## n8n Bloom Retrieval Flow

```
User sends message to Bloom (ChatbotWidget)
        ↓
Frontend POST: { message, user_id } → n8n webhook
        ↓
n8n embeds message with bge-m3 (existing Ollama node from rag.json)
        ↓
n8n queries skinprogress_activity_log:
  - must filter: user_id
  - optional: date range filter on "date" field if question mentions time
  - vector: embedded question
  - limit: 10
        ↓
Qdrant returns top-10 relevant event payloads
        ↓
n8n builds LLM context from returned "text" fields
        ↓
LLM answers the user's question
```

The `text` field in each payload is already human-readable prose — the LLM uses it directly as context without further transformation.

---

## Trigger Points (where each event is written)

| Event | Trigger location |
|---|---|
| `daily_quest_lock_in` | `HabitsController` — after lock-in is persisted to SQL |
| `selfie_taken` | `PhotoController` — after photo is saved |
| `selfie_analyzed` | After `AnalysisResult` is persisted to SQL (wherever the AI service response is saved) |
| `recommendations_given` | Immediately after `GenerateRecommendationsAsync` returns |

All four calls are fire-and-forget (`_ = Task.Run(...)`) so they never block or fail the primary HTTP response.

---

## Out of Scope

- Unifying frontend and backend recommendation engines
- Bloom n8n workflow creation (separate task — workflow does not exist yet)
- Semantic search from the backend (only n8n/Bloom queries Qdrant semantically; backend uses scroll+filter for history)
- Backfilling historical events for existing users
