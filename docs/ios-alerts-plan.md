# iOS Alert System — Stonebound Performance PoC
## Planning Document for Cursor

> **Status:** Planning only. No Swift code exists yet. Apple Developer account arriving Friday.
> **Goal:** Full spec Cursor can implement as a native iOS target alongside (or wrapping) the deployed web app.

---

## Architecture Decision: Local vs Push

### Recommendation: Hybrid

| Trigger type | Mechanism | Rationale |
|---|---|---|
| Scheduled meals, supplements, reminders | **Local** (`UNUserNotificationCenter`) | Fully offline, deterministic, no server cost |
| Post-workout recovery window | **Push** (APNs via Supabase Edge Function) | Workout end detected by wearable webhook; app may be backgrounded |
| Wearable status changes | **Push** | WHOOP/Polar webhooks hit Supabase, not the device |
| Expenditure change alerts | **Push** | Derived from daily wearable summary data server-side |
| Coach messages / admin nudges | **Push** | Originate from web admin dashboard |

### iOS notification permission flow (implement in onboarding)
1. Request **provisional authorization** on first launch (`UNAuthorizationOptionProvisional`). Delivers silently to Notification Center — no prompt required.
2. After first value-add moment (e.g. first log or first wearable sync), upgrade to explicit request (`alert + sound + badge`).
3. In Settings screen, show per-category toggles. Toggling a category schedules/cancels local triggers and updates `profiles.notification_prefs` in Supabase.

---

## Device Token Storage

Add to `profiles` table:
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apns_token text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS apns_token_updated_at timestamptz;
```

On app launch and on `didRegisterForRemoteNotificationsWithDeviceToken`:
- `PATCH /profiles?id=eq.<userId>` with `{ apns_token, apns_token_updated_at: now() }`
- Token stored server-side; Supabase Edge Functions use it to send APNs pushes

---

## Notification Categories (iOS `UNNotificationCategory`)

Define these in `AppDelegate` / `UNUserNotificationCenter` setup:

| Category ID | Actions | Use |
|---|---|---|
| `SURVEY_RPE` | `RPE_1`…`RPE_10` (inline reply or 5-button quick action) | Post-workout RPE |
| `SURVEY_READINESS` | `READY_LOW`, `READY_MED`, `READY_HIGH` | Daily readiness check-in |
| `LOG_MEAL` | `LOG_NOW` (open app to log screen), `DISMISS` | Meal/intake reminders |
| `LOG_QUICK_ENTRY` | `QUICK_LOG` (opens quick-add sheet) | Post-workout recovery window |
| `SUPPLEMENT_TAKEN` | `MARK_TAKEN`, `SNOOZE_15` | Supplement reminders |
| `ENCOURAGEMENT` | (no actions, informational) | Streaks, milestones |
| `WEARABLE_STATUS` | `OPEN_SETTINGS` | Connection/battery alerts |

---

## Alert Categories — Full Spec

### 1. Pre-Activity Nutrition

**Triggers**
- T−90 min before scheduled workout start time
- T−30 min before scheduled workout start time (second, shorter reminder)

**Content**
- Body references upcoming session type (strength / endurance / HIIT) and estimated duration if available
- Carb and protein recommendation based on `nutrition_targets.sport_type` + session duration bracket:
  - `< 60 min` → light pre-fuel ("~30g carbs, skip heavy protein")
  - `60–90 min` → moderate ("~50g carbs + 15g protein")
  - `> 90 min` → full meal ("~75g carbs + 20g protein, 2+ hrs before")
- Example title: "Fuel up — workout in 90 min"
- Example body: "You have a 90-min endurance session at 6 PM. Aim for ~50g carbs + 15g protein now."

**Data sources**
- `workout_schedule` table (to be created) or wearable planned session if available
- `nutrition_targets` (calories_kcal, protein_g, sport_type)
- `profiles.timezone`

**Pref key:** `pre_activity_nutrition` (bool, default true)

**Category:** `LOG_MEAL`

---

### 2. During-Activity Nutrition

**Triggers**
- Push only, fired by wearable webhook when session detected as ongoing
- First fire: 45 min after workout start
- Repeat: every 45–60 min for sessions > 90 min (max 3 fires per session)
- Only for endurance/sport_type categories; skip for strength < 60 min

**Content**
- Hydration reminder + carb intake for sustained energy
- Example title: "45 min in — stay fueled"
- Example body: "You've been at it for 45 min. Sip ~500ml water and consider 20–30g fast carbs if the session continues."

**Data sources**
- Wearable webhook (`whoop-webhook`) — session in-progress signal
- `nutrition_targets.sport_type`

**Pref key:** `during_activity_nutrition` (bool, default true)

**Category:** `LOG_QUICK_ENTRY`

**Implementation note:** Supabase Edge Function `send-push-notification` (to be created) fires APNs push when `whoop-webhook` detects session_type + elapsed time milestones.

---

### 3. Post-Activity Nutrition (Recovery Window)

**Triggers**
- Push, fired by wearable webhook at session end detection
- Fire 1: T+15 min after end (immediate recovery window open)
- Fire 2: T+90 min after end if no food log entry created since session end (check `food_logs.created_at`)

**Content**
- Fire 1: "Recovery window open — log your refuel"
  Body: "Session ended. Your 45-min anabolic window is open. Log protein + carbs to start recovery."
- Fire 2 (if no log): "Recovery meal not logged yet"
  Body: "It's been 90 min since your session. Log what you ate or tap Quick Log to add it now."

**Data sources**
- `food_logs` (check if any rows since session end)
- `workout_sessions` (last end_time, calories_burned from wearable)
- `nutrition_targets.protein_g`

**Pref key:** `post_activity_nutrition` (bool, default true)

**Category:** `LOG_QUICK_ENTRY`

---

### 4. Micronutrient Supplementation

**Triggers**
- Local, user-configured. Defaults suggested during onboarding.
- Up to 3 supplement reminders per day (morning / pre-workout / evening)
- Default schedule: 7:00 AM (morning supps), 30 min before workout (pre-workout), 9:00 PM (evening)

**Content**
- Title: "Time for your [Morning / Pre-workout / Evening] supplements"
- Body shows user-configured supplement list (stored as JSON array in `profiles.supplement_stack`)
- Example: "Take: Creatine 5g · Vitamin D 2000IU · Omega-3 1g"

**Data model addition:**
```json
// profiles.supplement_stack (JSONB array)
[
  { "name": "Creatine", "dose": "5g", "timing": "morning" },
  { "name": "Vitamin D", "dose": "2000IU", "timing": "morning" },
  { "name": "Beta-Alanine", "dose": "3.2g", "timing": "pre_workout" }
]
```

**Pref key:** `supplement_reminders` (bool, default true)

**Category:** `SUPPLEMENT_TAKEN`

**Action — MARK_TAKEN:** calls `PATCH /profiles` or inserts a `supplement_log` row (lightweight table: `id, user_id, taken_at, timing_slot`)

**Action — SNOOZE_15:** reschedules same notification for T+15 min via local trigger

---

### 5. Meal Timing

**Triggers**
- Local, based on user's configured meal schedule stored in `profiles.meal_schedule`
- Default schedule (can be edited in Settings):
  - Breakfast: 7:30 AM
  - Lunch: 12:30 PM
  - Afternoon snack: 3:30 PM (optional)
  - Dinner: 7:00 PM

**Logic**
- Fire at −10 min before each meal window ("Lunch in 10 min")
- Skip if: a pre- or post-activity notification fired in the last 30 min (avoid stack)
- Skip if: user already logged a meal in the last 45 min

**Pref key:** `meal_timing_reminders` (bool, default true)

**Category:** `LOG_MEAL`

---

### 6. Meal Reminders (Escalating)

**Triggers**
- Local, fire if no food log entry in `food_logs` since meal window opened
- T+30 min past meal window: gentle ("Haven't logged lunch yet")
- T+60 min past meal window: stronger ("Missed your lunch window")
- Auto-cancel once a log entry is created (app background check or push)
- Quiet hours: do not fire between 10 PM and 7 AM

**Content**
- T+30: "Log your lunch" / "Quick check — did you eat?"
- T+60: "Lunch window passed" + "Log it anyway — late logs help your coach see patterns."

**Pref key:** `meal_logging_reminders` (bool, default true)
Maps to existing `meal_logging_reminder` key in `notification_prefs` (keep backward compatible)

---

### 7. Intake Reminders (Calorie / Protein Pacing)

**Triggers**
- Local, scheduled daily at 12:00 PM and 4:00 PM
- Only fire if `food_logs` count for today is low relative to time of day
- Noon: fire if < 1 log entry (skipped breakfast likely)
- 4 PM: fire if daily calories logged < 40% of `nutrition_targets.calories_kcal`

**Content**
- Noon: "You're off to a light start" — "Only [N] meals logged. Make sure you're hitting your targets before the afternoon."
- 4 PM: "Calorie check — you're at [X]% of today's goal" — "With ~3 hours before dinner, aim to close the gap."

**Implementation note:** These are computed locally using cached `nutrition_targets` and a daily summary fetched on app foreground. Requires local caching of today's log data.

**Pref key:** `intake_pacing_reminders` (bool, default true)

---

### 8. Meal Suggestions

**Triggers**
- Fires when:
  1. User is in a meal window (±45 min of configured meal time), AND
  2. A specific macro is tracking low (< 50% of remaining daily target), AND
  3. User has not logged anything in the last 2 hours

**Content**
- Title: "Macro gap — here's an idea"
- Body: Personalized based on which macro is lowest. 3–4 food suggestions drawn from a static lookup table keyed by macro gap type.
- Protein low → "Greek yogurt (17g), chicken thigh (25g), cottage cheese (14g), or a whey shake (~25g)"
- Carbs low → "Rice (45g/cup), banana (27g), oats (30g/half cup), sweet potato (26g)"
- Both → "Balanced plate: palm-size protein + fist-size carbs"

**Data model:** Static suggestion table baked into app bundle (no API call needed for PoC). `SuggestionLibrary.swift` keyed by `MacroGapType` enum.

**Pref key:** `meal_suggestions` (bool, default true)

**Category:** `LOG_MEAL`

---

### 9. Activity Surveys

#### 9a. Post-Workout RPE Survey
**Trigger:** Push, T+5 min after workout end (fires before recovery window notification)

**Content**
- Title: "How hard was that? Rate your session"
- Body: "Tap to rate effort (RPE 1–10) and log any notes."

**Category:** `SURVEY_RPE`
**Actions:** Quick-reply integer 1–10 (implement as `UNTextInputNotificationAction` for PoC simplicity, or 5 stepped buttons)

**Tap behavior:** Open app to post-workout survey sheet with full fields: RPE, perceived fatigue, injury flag, notes.

**Data written to:** `workout_sessions.rpe`, `workout_sessions.notes`, `workout_sessions.surveyed_at`

#### 9b. Daily Readiness Check-in
**Trigger:** Local, daily at 8:00 AM (configurable). Skip if: readiness already submitted today.

**Content**
- Title: "Morning check-in — how do you feel?"
- Body: "Rate your readiness, sleep quality, and stress in 15 seconds."

**Category:** `SURVEY_READINESS`
**Actions:** `READY_LOW` (Rough), `READY_MED` (OK), `READY_HIGH` (Great) — each writes to `daily_readiness` table and dismisses

**Data written to:** new `daily_readiness` table:
```sql
CREATE TABLE IF NOT EXISTS public.daily_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  date date NOT NULL,
  readiness_level int CHECK (readiness_level BETWEEN 1 AND 5),
  sleep_quality int CHECK (sleep_quality BETWEEN 1 AND 5),
  stress_level int CHECK (stress_level BETWEEN 1 AND 5),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);
```

**Pref key:** `daily_readiness_survey` (bool, default true)

#### 9c. Weekly Recovery Survey
**Trigger:** Local, every Sunday at 6:00 PM

**Content**
- Title: "Weekly wrap — recovery check"
- Body: "How was your recovery quality this week? Quick 3-question check."

**Category:** `LOG_MEAL` (reuse, no special actions — just opens app)

**Pref key:** `weekly_recovery_survey` (bool, default false initially)

---

### 10. Expenditure Change Reminders

**Triggers**
- Push, fired by a Supabase Edge Function `daily-insights` (cron or post-wearable-sync)
- Conditions:
  - **High strain day:** Today's calorie burn > 7-day rolling average + 25% (e.g., +400 kcal)
  - **Rest day after high-volume block:** Today strain < 50% of prior 3-day avg

**Content**
- High strain: "High output day detected" — "You burned ~[X] kcal — about [+Y]% above your weekly average. Consider extra carbs (30–50g) and bump hydration."
- Rest day: "Recovery day — fuel smart" — "Your body is in repair mode. Prioritize protein (hit your target) and reduce high-GI carbs unless energy is very low."

**Personalization:** Body text adapts based on `nutrition_targets.sport_type` (endurance vs strength)

**Data sources:** `daily_summaries` table (wearable data), 7-day window query

**Pref key:** `expenditure_change_alerts` (bool, default true)

---

### 11. Deep Nutrition Opportunities / Recognition

**Triggers**
- Push, fired by `daily-insights` Edge Function
- Conditions (check in priority order, send at most 1 per day):
  - Hit protein target 3+ days in a row → "Protein streak"
  - Hit calorie target 5+ days in a row → "Fueling consistency"
  - Micronutrient timing insight opportunity (e.g., evening is a good time for ZMA/zinc)
  - Post-strength session with no carb log → "Missed carb window" deep insight

**Content examples**
- Streak: "3-day protein streak — consistency compounds" — "Hitting your protein target 3 days running supports steady muscle synthesis. Keep the streak going."
- Timing insight: "Iron absorption tip" — "If you take iron supplements, pair them with vitamin C (a glass of OJ) and avoid calcium at the same time for 2x absorption."
- Missed carb window: "Post-lift carbs matter" — "Strength sessions deplete muscle glycogen even if they feel short. 30–50g carbs in your next meal helps replenishment."
- Micronutrient: "Zinc + magnesium at night" — "Taking ZMA or magnesium before bed supports sleep quality and testosterone maintenance — especially during high training weeks."

**Pref key:** `deep_nutrition_insights` (bool, default true)

---

### 12. Positive Encouragement — Logging Milestones

**Triggers**
- Local, checked on app foreground / after each log save
- Milestones:
  - First food log ever → immediate in-app banner + notification if app is backgrounded
  - 3-day logging streak
  - 7-day logging streak
  - 14-day logging streak
  - 30-day logging streak
  - Streak recovery (streak broken after 3+): "It's OK — pick up where you left off"

**Content**
- First log: "You started — that's everything" — "Logging your first meal is the hardest step. Athletes who log 3+ days a week improve their targets 2x faster."
- 7-day streak: "One week of fueling data — impressive" — "Your coach and AI can now give you much more accurate recommendations. Keep building."
- Streak recovery: "You missed a day — no big deal" — "One day off doesn't break progress. Today's a great day to restart your streak."

**Data source:** `profiles.logging_streak` (int, maintained by trigger or Edge Function) or computed client-side from `food_logs` dates

**Pref key:** `logging_encouragement` (bool, default true)

---

### 13. Regular Encouragement

**Triggers**
- **Morning motivation** (local, 7:00 AM, 3 days/week — Mon/Wed/Fri):
  - Rotates through a bundle of ~30 short messages (stored in app bundle, no API)
  - Messages are sport/performance-focused, not generic fitness fluff
- **Weekly performance summary** (push, every Monday 9:00 AM):
  - Generated by `weekly-summary` Edge Function
  - "Last week: [N] workouts · [X] kcal avg · [Y]g protein avg"
- **Goal progress** (push, ad hoc when milestone crossed):
  - First week hitting weekly calorie target
  - First week where all daily protein targets met

**Pref key:** `regular_encouragement` (bool, default true)
**Pref key:** `weekly_summary` (bool, default true)

---

### 14. Wearable Status Updates

**Triggers**
- Push (from Supabase, detecting sync gaps) + local fallback

**Conditions and content**

| Condition | Trigger | Title | Body |
|---|---|---|---|
| WHOOP not synced > 6 hrs | Push from Supabase, hourly cron check | "WHOOP hasn't synced" | "Last sync was [X] hours ago. Open WHOOP app to reconnect." |
| Polar not synced > 8 hrs | Push | "Polar sync delayed" | "Check your Polar device connection in settings." |
| Garmin not synced > 8 hrs | Push | "Garmin data gap" | "Open Garmin Connect to force a sync." |
| Wearable battery low (< 20%) | Push (if wearable API provides battery level) | "WHOOP battery low" | "[X]% battery remaining — charge before your next session." |
| Sync restored after gap | Push (optional) | "WHOOP reconnected" | "Data synced through [timestamp]. Recovery and sleep scores updated." |
| OAuth token expired | Push | "Reconnect WHOOP" | "Your WHOOP connection expired. Tap to reauthorize." |

**Data sources:** `wearable_connections` table (to be created if not exists):
```sql
CREATE TABLE IF NOT EXISTS public.wearable_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  provider text NOT NULL, -- 'whoop' | 'polar' | 'garmin'
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  battery_pct int,
  status text DEFAULT 'connected', -- 'connected' | 'expired' | 'error'
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);
```

**Pref key:** `wearable_status_alerts` (bool, default true)

---

## Supabase Edge Functions to Create

| Function | Purpose | Trigger |
|---|---|---|
| `send-push-notification` | APNs HTTP/2 delivery with `apns_token` from profiles | Called by other functions |
| `daily-insights` | Compute expenditure changes, deep nutrition, encouragement pushes | Supabase cron or post-wearable-sync |
| `weekly-summary` | Weekly performance digest push | Supabase cron (Monday 9 AM) |
| `check-wearable-sync` | Detect sync gaps, fire wearable status pushes | Supabase cron (every hour) |

All functions: Deno/TypeScript, follow pattern of existing `stripe-webhook` and `create-checkout-session`.

---

## `profiles.notification_prefs` Schema Extension

Extend the existing JSONB column. Full proposed key set (all bool unless noted):

```json
{
  "nutrition_protein_low": true,
  "nutrition_calories_low": true,
  "meal_logging_reminder": true,
  "pre_activity_nutrition": true,
  "during_activity_nutrition": true,
  "post_activity_nutrition": true,
  "supplement_reminders": true,
  "meal_timing_reminders": true,
  "meal_logging_reminders": true,
  "intake_pacing_reminders": true,
  "meal_suggestions": true,
  "activity_survey_rpe": true,
  "daily_readiness_survey": true,
  "weekly_recovery_survey": false,
  "expenditure_change_alerts": true,
  "deep_nutrition_insights": true,
  "logging_encouragement": true,
  "regular_encouragement": true,
  "weekly_summary": true,
  "wearable_status_alerts": true
}
```

No migration needed — JSONB column accepts new keys. New keys absent from existing rows fall back to `true` (enabled by default) in app logic.

---

## `profiles.supplement_stack` Column (New)

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS supplement_stack jsonb DEFAULT '[]'::jsonb;
```

Schema per item:
```json
{ "name": "Creatine", "dose": "5g", "timing": "morning" }
```
Valid timing values: `"morning"`, `"pre_workout"`, `"evening"`, `"with_meal"`.

---

## iOS App Architecture Notes (for Cursor)

### Notification scheduling strategy
- On app foreground: fetch today's `nutrition_targets`, `food_logs`, `workout_schedule`, `notification_prefs` from Supabase (cache locally with 30-min TTL)
- Rebuild local notification schedule whenever prefs or schedule data changes
- Cancel all pending local notifications for a category before rescheduling (avoid duplicates)
- Use `UNUserNotificationCenter.current().pendingNotificationRequests()` to inspect and deduplicate

### Deep links
URL scheme: `stonebound://`

| Path | Opens |
|---|---|
| `stonebound://log` | Quick food log sheet |
| `stonebound://survey/rpe` | Post-workout RPE survey sheet |
| `stonebound://survey/readiness` | Daily readiness survey sheet |
| `stonebound://settings/notifications` | Notification preferences screen |
| `stonebound://wearables` | Wearable connection settings |
| `stonebound://dashboard` | Main dashboard |

### Quiet hours
Global quiet hours: 10:00 PM – 7:00 AM (local timezone).
All local notifications scheduled outside this window.
For push: Edge Functions check user timezone from `profiles.timezone` before sending.

### Supplement "SNOOZE_15" action
Implement as: cancel original notification identifier, create new `UNTimeIntervalNotificationTrigger` for 900 seconds with the same content and identifier suffix `_snooze1`, `_snooze2` (max 2 snoozes per slot).

### Survey quick-reply via notification
For `SURVEY_RPE`: Use `UNTextInputNotificationAction` with placeholder "1–10". Validate in `userNotificationCenter(_:didReceive:withCompletionHandler:)` — parse int, clamp 1–10, write to Supabase.
For `SURVEY_READINESS`: Three `UNNotificationAction` buttons (`Rough`, `OK`, `Great`) map to readiness_level 2, 3, 5.

---

## Migration File Naming

Follow existing convention (`supabase/migrations/YYYYMMDDHHMMSS_description.sql`):
- `supabase/migrations/20260414000000_notification_columns.sql` — adds `apns_token`, `supplement_stack` to profiles, creates `daily_readiness` and `wearable_connections` tables
- `supabase/migrations/20260414000100_workout_schedule.sql` — creates `workout_schedule` table if Cursor implements server-side scheduling

---

## What Cursor Should NOT Do Yet
- Do not implement APNs certificate/key management (requires Apple Developer account — Friday)
- Do not add Universal Links / Associated Domains config (requires Netlify `apple-app-site-association` file — do after provisioning)
- Do not stub real Stripe-like keys for APNs
- Do not create a full meal suggestion ML model — static lookup table is sufficient for PoC
