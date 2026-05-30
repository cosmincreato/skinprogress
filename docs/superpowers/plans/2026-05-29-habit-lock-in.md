# Habit Lock-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit "Lock In" button click before a daily habit completion is saved to the database, making it irreversible once confirmed.

**Architecture:** All changes are in `ui/src/pages/ProfilePage.tsx`. A new `habitLockState` (3-state per habit) replaces the direct checkbox→DB write. The backend is unchanged — `POST /api/habits/complete` already prevents duplicates and has no undo endpoint.

**Tech Stack:** React 19, TypeScript (strict), Tailwind CSS v4

---

## File Map

| File | Change |
|---|---|
| `ui/src/pages/ProfilePage.tsx` | Add `LockState` type; add `habitLockState` state; update load logic; replace `handleHabitToggle`; add `handleLockIn`; update habit card JSX |

---

## Task 1: Add `LockState` type, `habitLockState` state, and initialize from loaded data

**Files:**
- Modify: `ui/src/pages/ProfilePage.tsx:32-34` (type block), `ui/src/pages/ProfilePage.tsx:208-218` (state block), `ui/src/pages/ProfilePage.tsx:418-420` (after `setHabitEntries`)

- [ ] **Step 1: Add the `LockState` type next to the existing `HabitKey` and `HabitDayRecord` types (after line 34)**

  In `ui/src/pages/ProfilePage.tsx`, after:
  ```typescript
  type HabitDayRecord = Record<HabitKey, boolean>;
  ```
  Add:
  ```typescript
  type LockState = "unchecked" | "checked" | "locked";
  ```

- [ ] **Step 2: Add `habitLockState` state inside `ProfilePage`, after the existing `habitEntries` state (after line 210)**

  After:
  ```typescript
  const [habitEntries, setHabitEntries] = useState<
    Record<string, HabitDayRecord>
  >({});
  ```
  Add:
  ```typescript
  const [habitLockState, setHabitLockState] = useState<
    Record<HabitKey, LockState>
  >({ cleaning: "unchecked", hydration: "unchecked", spf: "unchecked" });
  ```

- [ ] **Step 3: Initialize `habitLockState` from today's loaded data**

  In the `loadHabitsAndBadges` function, directly after `setHabitEntries(habitMap)` (currently line 420), add:
  ```typescript
  const todayKey = getTodayDateKeyUTC();
  const todayRecord = habitMap[todayKey];
  if (todayRecord) {
    setHabitLockState({
      cleaning: todayRecord.cleaning ? "locked" : "unchecked",
      hydration: todayRecord.hydration ? "locked" : "unchecked",
      spf: todayRecord.spf ? "locked" : "unchecked",
    });
  }
  ```

- [ ] **Step 4: Remove the now-unused `todayHabits` derived variable (line 218)**

  Delete this line:
  ```typescript
  const todayHabits = habitEntries[todayHabitKey] ?? createEmptyHabitRecord();
  ```
  (It was only used by the habit checkbox at line 739, which Task 3 replaces.)

- [ ] **Step 5: Verify TypeScript compiles with no errors**

  ```bash
  cd ui && npx tsc --noEmit
  ```
  Expected: no errors (the `todayHabits` reference at line 739 will error — that's expected and fixed in Task 3).

  > Note: if the tsc error from the deleted variable is the only error, that's fine — it confirms the deletion is the only remaining dependency.

- [ ] **Step 6: Commit**

  ```bash
  git add ui/src/pages/ProfilePage.tsx
  git commit -m "feat: add LockState type and habitLockState, init from loaded data"
  ```

---

## Task 2: Replace `handleHabitToggle` and add `handleLockIn`

**Files:**
- Modify: `ui/src/pages/ProfilePage.tsx:464-492` (handler block)

- [ ] **Step 1: Add `HABIT_NAMES` constant outside the component (after the existing `DAILY_HABITS` constant, around line 51)**

  After:
  ```typescript
  const DAILY_HABITS: { key: HabitKey; label: string }[] = [
    { key: "cleaning", label: "Cleanse" },
    { key: "hydration", label: "Hydrate" },
    { key: "spf", label: "SPF" },
  ];
  ```
  Add:
  ```typescript
  const HABIT_NAMES: Record<HabitKey, string> = {
    cleaning: "Cleanse",
    hydration: "Hydrate",
    spf: "SPF",
  };
  ```

- [ ] **Step 2: Replace `handleHabitToggle` (lines 464-492) with the new non-async version**

  Remove the entire existing `handleHabitToggle` function and replace it with:
  ```typescript
  const handleHabitToggle = (habit: HabitKey) => {
    setHabitLockState((prev) => {
      if (prev[habit] === "locked") return prev;
      return {
        ...prev,
        [habit]: prev[habit] === "checked" ? "unchecked" : "checked",
      };
    });
  };
  ```

- [ ] **Step 3: Add `handleLockIn` immediately after `handleHabitToggle`**

  ```typescript
  const handleLockIn = async (habit: HabitKey) => {
    try {
      await habitsService.completeHabit(HABIT_NAMES[habit]);
      setHabitLockState((prev) => ({ ...prev, [habit]: "locked" }));
      setHabitEntries((prev) => {
        const current = prev[todayHabitKey] ?? createEmptyHabitRecord();
        return { ...prev, [todayHabitKey]: { ...current, [habit]: true } };
      });
    } catch (error) {
      console.error("Failed to lock in habit:", error);
    }
  };
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd ui && npx tsc --noEmit
  ```
  Expected: the only remaining error should be the `todayHabits` reference in the JSX (fixed in Task 3).

- [ ] **Step 5: Commit**

  ```bash
  git add ui/src/pages/ProfilePage.tsx
  git commit -m "feat: split handleHabitToggle into toggle+lockIn, no DB write on check"
  ```

---

## Task 3: Update habit card UI to reflect lock states

**Files:**
- Modify: `ui/src/pages/ProfilePage.tsx:737-762` (habit card grid JSX)

- [ ] **Step 1: Replace the habit card grid JSX**

  Replace the entire block from `<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">` through its closing `</div>` (lines 737–762) with:

  ```tsx
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    {DAILY_HABITS.map((habit) => {
      const lockState = habitLockState[habit.key];
      const isLocked = lockState === "locked";
      const isChecked = lockState === "checked" || isLocked;

      return (
        <div
          key={habit.key}
          className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors ${
            isLocked
              ? "border-green-500/40 bg-green-500/10"
              : isChecked
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-slate-700 bg-slate-800/40 hover:border-slate-500"
          }`}
        >
          <label
            className={`flex items-center justify-between ${isLocked ? "cursor-default" : "cursor-pointer"}`}
          >
            <span className="text-on-surface font-medium flex items-center gap-2">
              {habit.label}
              {isLocked && (
                <span className="text-xs text-green-400" aria-label="Locked">
                  🔒
                </span>
              )}
            </span>
            <input
              type="checkbox"
              checked={isChecked}
              disabled={isLocked}
              onChange={() => handleHabitToggle(habit.key)}
              className="h-4 w-4 accent-green-500 disabled:opacity-50"
            />
          </label>
          {lockState === "checked" && (
            <button
              onClick={() => handleLockIn(habit.key)}
              className="w-full rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold py-1.5 transition-colors"
            >
              Lock In
            </button>
          )}
        </div>
      );
    })}
  </div>
  ```

- [ ] **Step 2: Verify TypeScript compiles clean**

  ```bash
  cd ui && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Run ESLint**

  ```bash
  cd ui && npm run lint
  ```
  Expected: no new errors.

- [ ] **Step 4: Start the dev server and manually verify the happy path**

  ```bash
  cd ui && npm run dev
  ```
  Open `http://localhost:5173` and navigate to the Profile page.

  Verify:
  1. All 3 habits load as unchecked (assuming no completions today)
  2. Checking a habit shows it in amber with a "Lock In" button
  3. Unchecking removes the button and resets to default styling
  4. Clicking "Lock In" turns the card green, disables the checkbox, shows 🔒
  5. The other two habits remain fully interactive
  6. Refreshing the page: the locked habit loads back as locked (green + 🔒), others as unchecked

- [ ] **Step 5: Commit**

  ```bash
  git add ui/src/pages/ProfilePage.tsx
  git commit -m "feat: habit card shows lock state with Lock In button, irreversible once locked"
  ```
