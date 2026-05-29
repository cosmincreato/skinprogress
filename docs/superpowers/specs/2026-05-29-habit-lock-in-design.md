# Habit Lock-In Design

**Date:** 2026-05-29  
**Status:** Approved

## Overview

Add an explicit "Lock In" step before a daily habit completion is persisted to the database. Until locked, the checkbox is local UI state only. Once locked, the completion is irreversible and the habit is frozen for that day. All three habits are independent — locking one does not affect the others.

## Data & Backend

No changes. The existing `POST /api/habits/complete` endpoint already:
- Rejects duplicate completions for the same day
- Has no delete/undo endpoint exposed

Irreversibility is already enforced server-side. No new migrations or backend code needed.

## Frontend State Model

Each of the 3 habits (`cleaning`, `hydration`, `spf`) tracks one of three local states:

| State | Meaning |
|---|---|
| `unchecked` | Default; habit not interacted with this session |
| `checked` | Checkbox ticked; not yet saved to DB |
| `locked` | Lock In clicked and DB write succeeded; irreversible |

**On page load:** `GET /api/habits/daily` is called. Any habit that already has a completion record for today initialises directly to `locked` (skipping `checked`). The rest initialise to `unchecked`.

State is not persisted between page loads. A `checked`-but-not-locked habit resets to `unchecked` on refresh.

## Component Changes

All changes are in `ui/src/pages/ProfilePage.tsx`.

### State

Replace the current boolean `habitCompletions` flags with a lock-state map:

```typescript
type LockState = 'unchecked' | 'checked' | 'locked';
const [habitLockState, setHabitLockState] = useState<Record<string, LockState>>({
  cleaning: 'unchecked',
  hydration: 'unchecked',
  spf: 'unchecked',
});
```

### Checkbox behaviour

- `unchecked` → `checked`: checkbox becomes ticked; Lock In button appears
- `checked` → `unchecked`: checkbox unticks; Lock In button disappears
- `locked`: checkbox is `disabled` and permanently checked; no handler fires

### Lock In button

- Renders only when state is `checked`
- On click: calls `habitsService.completeHabit(habitName)`
  - Success → set state to `locked`
  - Failure → stay `checked` (user can retry)

### Locked visual

- Checkbox is grayed out / `disabled`
- Small lock icon rendered next to the habit label
- Lock In button is absent

### Handler changes

- `handleHabitToggle` (currently ~line 464): no longer calls `completeHabit`. Only toggles `unchecked` ↔ `checked`.
- New `handleLockIn(habitKey: string)`: calls `completeHabit`, transitions to `locked` on success.

## Behaviour Summary

| Scenario | Result |
|---|---|
| Check a habit, don't lock, refresh page | Resets to unchecked |
| Lock a habit | DB record written; checkbox disabled with lock icon |
| Try to lock an already-locked habit | Impossible — button not rendered |
| Lock habit A; habits B and C | B and C remain fully interactive |
| Load page when habit already completed today | Habit loads as locked immediately |

## Out of Scope

- No backend changes
- No new DB columns or migrations
- No persistence of the `checked` (pre-lock) state across page loads
- No undo/unlock mechanism
