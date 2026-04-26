# CommunityPulse — AI Handoff Context File
# Last updated: post-session (Gemma/Ollama migration, national app, county picker, enhanced results)
# Purpose: Any AI continuing this build should read this file first.

---

## What We're Building
**CommunityPulse** — A national One Health participatory health surveillance app covering all 3,221 US counties.
- Users self-report symptoms (or wellness) daily, selecting their county from a searchable picker
- AI detects community outbreak clusters using self-reports + CDC FluView + weather + Epicore + BEACON
- Tells users whether to notify contacts, shows forecast trend, reads recommendation aloud (ElevenLabs)
- Personalized self-care tips tailored to reported symptoms, exposures, and local weather
- Engages users with streaks, friends leaderboard, and profile stats
- Interactive US county map with hover tooltips, travel-flow arcs, and click-to-detail panel

**Hackathon:** EpiHack Arizona (May 18–22, 2026) | **Track:** Track 2 — Participatory Surveillance Risk Challenge
**Team:** Jacob (backend), Kayvon (frontend), Joeli (data/forecast), Aurora (UI)

---

## Current Build Status
- [x] Flask backend (port 5001) — all endpoints working
- [x] React frontend (port 3000) — full flow working
- [x] CDC FluView live — correct HHS region per county's state (10 regions mapped, fallback to national)
- [x] OpenWeatherMap live (weather by lat/lon for all endpoints)
- [x] Gemma 4 via Ollama — local inference, offline, free (replaces OpenAI GPT-4o)
- [x] ElevenLabs live (voice TTS)
- [x] SQLite DB — empty (no synthetic data)
- [x] Demo mode — seed/clear ~500 realistic US county reports via UI button
- [x] User accounts (register/login/JWT auth)
- [x] Friends list (add/remove by username)
- [x] Streak leaderboard (friends ranked by streak)
- [x] Profile page (stats: streak, best streak, check-ins, healthy %, county, rank)
- [x] Server-side streak tracking (linked to user_id on reports)
- [x] CORS fixed via React proxy (package.json → `"proxy": "http://localhost:5001"`)
- [x] US county map (react-simple-maps, color by sick rate, travel-flow arcs on hover)
- [x] County detail panel (click any county → Gemma synthesized risk + symptoms + travel + weather + external surveillance)
- [x] One Health minimum dataset form (EpiHack standard — all exposure/severity/environmental fields)
- [x] County picker (searchable autocomplete over all 3,221 US counties, replaces zip code input)
- [x] National app — no AZ defaults anywhere; CDC region, neighbor spread, prompts all state-aware
- [x] Enhanced results dashboard — county detail, self-care tips, structured recommendations, surveillance data
- [ ] Epicore API base URL (pending — goes live at event May 18)
- [ ] BEACON API (pending — DNS not resolving yet)
- [ ] Deploy (Vercel + Railway)
- [ ] GitHub README
- [ ] Devpost submission

---

## CRITICAL: No Synthetic Data Policy
The database (reports.db) is EMPTY by design. Do NOT seed it with fake data permanently.
The "🎭 Load Demo Data" button in the UI adds ~500 demo rows (tagged `is_demo=1`) temporarily.
"🗑 Clear Demo Data" removes them. Real user check-ins are never affected.

---

## AI Model: Gemma 4 via Ollama (LOCAL, OFFLINE, FREE)
OpenAI GPT-4o has been fully removed. All inference now runs through local Ollama.

```bash
# Setup (one time)
ollama serve
ollama pull gemma4:e4b

# Test integration
python3 test_gemma.py
```

- Ollama endpoint: `http://localhost:11434/api/generate`
- Model: `gemma4:e4b`
- `GEMMA_AVAILABLE` flag set at startup; all AI routes degrade gracefully to rule-based fallback if Ollama not running
- `gemma_model.py` — `GemmaPredictor` class (singleton via `get_predictor()`)
- `_call_gemma_json()` in app.py — sends prompt, extracts JSON from raw response (Ollama doesn't support `response_format`)

---

## Epicore + BEACON — Pending Until Event
Both APIs gracefully fall back to "data unavailable" strings in Gemma prompt.
- Epicore: set `EPICORE_API_URL=https://[domain]/api/events/closed` in `.env` when organizers share it
- BEACON: `beacon.phiresearchlab.org` — DNS not resolving yet, same graceful fallback
- No code changes needed — both functions already read from env vars and handle failures

---

## API Keys (.env)
```
OPENWEATHERMAP_API_KEY=eab75a27...  ← ACTIVE
ELEVENLABS_API_KEY=sk_5a116...      ← ACTIVE
EPICORE_API_URL=                    ← EMPTY — add when organizers provide domain
JWT_SECRET=                         ← Optional — defaults to dev secret, set in prod
# OPENAI_API_KEY — REMOVED, no longer used
```

---

## How to Run
```bash
# Ollama (required for AI — run in separate terminal)
ollama serve
# (first time only: ollama pull gemma4:e4b)

# Backend (from hackathon-az/hackathon-az/)
source venv/bin/activate
python3 app.py
# → Flask on http://localhost:5001

# Frontend (separate terminal)
cd frontend
npm start
# → React on http://localhost:3000
# Proxy routes all /api/* calls to :5001
```

---

## Architecture
```
React (port 3000)
  → proxy → Flask (port 5001)
              → Gemma 4 / Ollama (local) — checkin risk + county detail + all AI analysis
              → CDC FluView API      — correct HHS region per county state (LIVE)
              → Epicore API          — verified outbreak events (PENDING)
              → BEACON API           — biosurveillance signals (PENDING)
              → OpenWeatherMap API   — weather by lat/lon (all endpoints use coords now)
              → ElevenLabs API       — voice TTS (LIVE)
              → SQLite (reports.db)  — symptom reports + user accounts
              → OpenFlights data     — travel-flow arcs (3221 counties, 5450 routes, pre-loaded)
```

---

## Database Schema

### reports
```sql
id, timestamp, zip_code, county, fips,
feeling, symptoms (JSON array),
age_group, sex,
household_members, sick_household_members,
first_time_reporting,
-- Exposure
recent_travel, event_attendance, tick_insect_bite, animal_bite,
animal_contact, contact_sick_individual,
-- Severity
absent_from_work, absent_from_school, sought_healthcare, reporting_to_authority,
-- Environmental
water_concerns, flooding, sick_animals,
-- Meta
is_demo (0/1), user_id (FK → users.id, nullable for guests)
```
All new One Health columns added via safe `ALTER TABLE ... ADD COLUMN` migrations in `init_db()`.
`save_report(data, county, user_id, fips)` — fips now stored for all new reports.

### users
```sql
id, username (unique), email (unique), password_hash,
streak, best_streak, last_checkin, created_at
```

### friendships
```sql
id, user_id, friend_id, created_at
-- Bidirectional: both (A→B) and (B→A) rows inserted on add
```

---

## Backend Endpoints

### Public
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/checkin` | Submit check-in (auth optional) — accepts `fips`/`county`/`state` or legacy `zip_code` |
| GET | `/api/community-risk` | Risk map — all counties with sick reports (national, not AZ-only) |
| GET | `/api/us-map` | All county sick/healthy counts (for US map) |
| GET | `/api/travel-flow/<fips>` | Inbound travel illness arcs for a county |
| GET | `/api/county-detail/<fips>` | Full county analysis: symptoms, trend, travel, weather, Gemma |
| GET | `/api/counties` | All 3,221 US counties `{fips, county, state}` for county picker |

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account → returns JWT |
| POST | `/api/auth/login` | Login → returns JWT |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/profile` | Full profile stats |

### Friends & Leaderboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/friends` | List friends |
| POST | `/api/friends/add` | Add friend by username |
| POST | `/api/friends/remove` | Remove friend |
| GET | `/api/leaderboard` | Friends + self ranked by streak |

### Demo
| Method | Path | Description |
|---|---|---|
| POST | `/api/demo/seed` | Insert ~500 demo reports across US counties |
| POST | `/api/demo/clear` | Remove all is_demo=1 rows |
| GET | `/api/demo/status` | Returns {demo_active, demo_rows} |

### Gemma / AI
| Method | Path | Description |
|---|---|---|
| GET | `/api/gemma/status` | Ollama health check |
| POST | `/api/predict/risk` | Individual risk score |
| GET | `/api/predict/county-forecast` | 7-14 day county forecast |
| GET | `/api/predict/recommendations` | Personalized recommendations (auth required) |
| GET | `/api/predict/patterns` | Historical pattern analysis |

---

## Frontend Components
```
App.js                  — routing, auth state, header (username → profile, 🏆 → leaderboard)
api.js                  — all axios calls, auth token injected via authHeader()
components/
  CheckIn.js            — home screen, demo toggle, leaderboard card if logged in
  SymptomForm.js        — full One Health intake form (county picker replaces zip code)
  CountyPicker.js       — searchable autocomplete over all 3,221 US counties
                           fetches /api/counties once, caches in localStorage 24h
                           stores selection as {fips, county, state} in cp_county
  ResultsDashboard.js   — full results: risk banner, recommendations, self-care tips,
                           county overview (fetched via /api/county-detail),
                           symptoms, risk drivers, exposure factors, neighbor spread,
                           travel risk, environmental + surveillance, AI explainer
  ForecastChart.js      — Recharts 7-day trend (hidden if all-zero)
  WellnessMode.js       — healthy check-in: streak, tip, campaign message
  NotifyButton.js       — pre-written contact alert (shown only if report_count >= 2)
  AIExplainer.js        — accordion: data sources, model, caveats ("How did we calculate this?")
  USMapScreen.js        — interactive US map: hover tooltip, travel-flow arcs, click → detail panel
  CountyDetailPanel.js  — right-side drawer: symptoms, stats, AI risk, travel, weather,
                           neighboring county spread, external surveillance, age dist
  AuthScreen.js         — register/login tabs
  ProfileScreen.js      — user stats: streak, best streak, check-ins, county, rank
  LeaderboardScreen.js  — friends leaderboard + add/remove friends
```

---

## One Health Form Fields (SymptomForm.js)
All fields captured and persisted per EpiHack minimum dataset:

**Location:** County picker (searchable, all 3,221 US counties) — sends `fips`, `county`, `state`

**Symptoms** (4 categories, 23 symptoms):
- Whole Body: Fever, Chills/Night Sweats, Muscle Aches, Fatigue, Jaundice
- Respiratory: Cough/Congestion, Difficulty Breathing, Sore Throat, Loss of Smell/Taste, Runny Nose, Chest Tightness
- Digestive: Nausea/Vomiting, Diarrhea, Stomach Pain, Loss of Appetite
- Skin/Eyes/Other: Rash, Red Eyes, Headache, Dizziness, Bleeding from Body Openings, Discolored Urine, Ear Pain, Other

**Demographics:** county (picker), age group, sex, household members, sick household members

**Exposure toggles** (group: Exposure):
recent_travel, event_attendance, tick_insect_bite, animal_bite, animal_contact, contact_sick_individual

**Severity toggles** (group: Severity):
absent_from_work, absent_from_school, sought_healthcare, reporting_to_authority

**Environmental toggles** (group: Environmental):
water_concerns, flooding

---

## AI Prompt Design (app.py)

### Checkin (`SYSTEM_PROMPT` + `build_user_prompt`)
Structured into labeled sections:
- `=== INDIVIDUAL REPORT ===` — symptoms, location (county + state), demographics
- `=== ONE HEALTH EXPOSURE FACTORS ===` — all 6 exposure fields
- `=== SEVERITY INDICATORS ===` — healthcare-seeking, absence, authority reporting
- `=== ENVIRONMENTAL FACTORS ===` — water, flooding, sick animals
- `=== HIGH-SIGNAL FLAGS ===` — auto-detected critical flags (animal bite, tick bite, confirmed case, sought healthcare, flooding, high household sick rate)
- `=== COMMUNITY SURVEILLANCE ===` — cluster count, trend %, forecast, county notes
- `=== NEIGHBORING COUNTY SPREAD ===` — elevated illness in counties within 400 miles
- `=== WEATHER & EXTERNAL SURVEILLANCE ===` — weather, CDC FluView (correct HHS region), Epicore, BEACON

**Checkin response fields** (from Gemma or fallback):
```json
{
  "risk_level": "low|medium|high|critical",
  "recommendation": "...",
  "recommendations": [{"action": "...", "priority": "urgent|high|moderate|low", "reason": "..."}],
  "self_care_tips": [{"tip": "...", "category": "symptom relief|hydration|rest|monitoring|prevention|environment|nutrition|when to seek care"}],
  "notify_others": true/false,
  "notify_message": "...",
  "ai_explanation": "...",
  "risk_factors_flagged": ["..."],
  "wellness_tip": "...",
  "confidence": "low|medium|high",
  "confidence_note": "..."
}
```

**Checkin route also returns:** `fips`, `state`, `fluview`, `epicore`, `beacon`, `neighbor_spread`, `weather`, `cluster`

### County Detail (`COUNTY_ANALYSIS_PROMPT`)
Five labeled data streams passed to Gemma:
1. SELF-REPORTED SURVEILLANCE — local reports, symptoms, exposure factors, age dist
2. NEIGHBORING COUNTY SPREAD — elevated illness within 400 miles (geographic filter)
3. INBOUND TRAVEL ILLNESS RISK — OpenFlights × sick reports
4. ENVIRONMENTAL & WEATHER — temp, humidity, conditions
5. AUTHORITATIVE SURVEILLANCE — CDC FluView (correct region), Epicore, BEACON

Returns: `risk_level`, `summary`, `trend_assessment`, `key_drivers`, `recommendations`, `travel_risk_note`, `confidence`, `confidence_note`

---

## National App — No AZ Defaults

Everything is state/region-aware:
- **CDC FluView**: `get_cdc_fluview(state)` maps to one of 10 HHS regions; defaults to national (`nat`) if state unknown
- **Neighbor spread**: `_get_county_spread_context(lat, lon, max_miles=400)` — haversine distance filter so non-AZ counties don't see AZ-only data
- **`get_community_risk_map()`**: queries DB for all counties with recent sick reports (not AZ-only list)
- **`zip_to_county()`**: defaults to `"Unknown"` (not "Maricopa")
- **AI prompts**: say "national US One Health platform" (not "Arizona")
- **`HEALTH_BASELINE`**: was `AZ_BASELINE` — AZ-specific context notes still used for AZ counties, generic default for all others
- **`_COUNTY_COORDS`**: FIPS-keyed dict of all 3,221 US county coordinates (not AZ-only)

---

## Map Architecture (USMapScreen.js)

### Hover reliability fixes applied:
- `onMouseLeave` removed from individual `<Geography>` components (caused flicker)
- Container-level `onMouseLeave` with 80ms debounce (`clearTimer` ref)
- `activeFips` ref guards stale async travel-flow fetches
- `pointerEvents: 'none'` on FlowArcs `<g>` — arcs don't intercept mouse events
- `isTarget` fill always uses risk color (never `#ffffff22`) — only stroke changes for selection

### County detail panel (CountyDetailPanel.js):
- Click any county → `detailFips` state set → right drawer renders
- Calls `GET /api/county-detail/<fips>`
- Shows: AI risk badge, quick stats, 14-day outlook, symptom bars, key drivers, recommendations, exposure factors, neighboring county spread, travel inflow, weather, external surveillance (CDC/Epicore/BEACON), age distribution

---

## Results Dashboard (ResultsDashboard.js)
After checkin, displays a full personal health briefing:

1. **Risk Banner** — risk level + confidence, recommendation text, report count, trend
2. **What You Should Do** — structured recommendations list with priority badges (urgent/high/moderate/low)
3. **How to Help Yourself** — 4-6 self-care tips with category icons (💊💧😴🌡️🛡️🥗🏥) tailored to symptoms, exposures, weather
4. **Signals Detected** — specific risk factors that drove the assessment
5. **Trend Chart** — 7-day forecast (ForecastChart)
6. **Audio** — ElevenLabs TTS if available
7. **County Overview** — fetched in parallel via `/api/county-detail/{fips}`
   - AI county summary + 14-day outlook
   - Quick stats (reports, sick rate, trend)
   - Top symptoms in county
   - County risk drivers + guidance
   - One Health exposure factors
   - Neighboring county activity
   - Inbound travel illness risk
8. **Environmental & Surveillance** — weather + CDC FluView + Epicore + BEACON
9. **Wellness Tip** — if healthy
10. **How did we calculate this?** — AIExplainer accordion (collapsed by default)
11. **Age Distribution** (from county detail)

---

## Known Issues / Limitations
- Demo seed data uses old symptom IDs (snake_case like "fever", "cough") — county detail symptom bars will show these. Real user submissions use the new One Health label format. Not blocking.
- Epicore 404 and BEACON DNS failure are expected — both fall back gracefully.
- `zip_to_county` only maps AZ zip prefixes (legacy). New county picker sends FIPS directly, bypassing zip entirely.
- `HEALTH_BASELINE` (az_health_baseline.json) only has AZ county context notes; non-AZ counties get generic "default" notes — acceptable for demo.

---

## Auth Flow
- JWT stored in `localStorage` as `cp_token`
- User object stored in `localStorage` as `cp_user`
- All protected API calls send `Authorization: Bearer <token>` header
- Clicking username in header → ProfileScreen
- ProfileScreen has Sign Out button
- "Continue without an account" skips auth — app fully works for guests

---

## Streak Logic
- **Guest:** tracked in `localStorage` only (cp_streak, cp_last_checkin)
- **Logged in:** tracked server-side in `users.streak` + `users.best_streak`
  - Updated on every `/api/checkin` call
  - `server_streak` returned in checkin response, synced to localStorage via `useEffect` in ResultsDashboard
- **Best streak:** updated whenever current streak exceeds previous best

---

## LocalStorage Keys
| Key | Value | Set by |
|---|---|---|
| `cp_token` | JWT string | AuthScreen |
| `cp_user` | JSON user object | AuthScreen |
| `cp_county` | JSON `{fips, county, state}` | SymptomForm (CountyPicker) |
| `cp_county_list` | JSON `{data: [...], ts: epoch}` | CountyPicker (24h cache) |
| `cp_age_group` | "child"\|"adult"\|"elderly" | SymptomForm |
| `cp_streak` | integer string | ResultsDashboard / WellnessMode |
| `cp_last_checkin` | date string | ResultsDashboard / WellnessMode |

---

## Deployment (TODO)
- Frontend: `cd frontend && npm run build` → Vercel
- Backend: Railway (set all .env vars, `python3 app.py` start command)
- Ollama: must be running alongside backend — or swap to a hosted Gemma endpoint
- Update CORS if needed (currently allows all origins)
- Set `JWT_SECRET` to a strong random string in production

---

## Progress Log
### Hour 0 — Claude — Full codebase generated
All backend and frontend files written and integrated.

### Mid-hackathon pass 1 — Claude — Synthetic data removal + real APIs
- Cleared reports.db, replaced az_health_baseline.json with factual-only content
- Confirmed CDC FluView, OpenWeatherMap, ElevenLabs all live
- Fixed CORS via React proxy (port 5001)
- Added demo mode (seed/clear via UI)

### Mid-hackathon pass 2 — Claude — Account system
- Added users + friendships tables to SQLite
- JWT auth (register, login, /me, /profile)
- Friends: add/remove by username, bidirectional rows
- Streak leaderboard: friends + self ranked by streak
- Profile page: all-time stats, best streak, check-in breakdown, county, rank
- user_id attached to reports when logged in

### Mid-hackathon pass 3 — Claude — US Map + County Detail + One Health Form
- Replaced AZ-only map with full interactive US county map (react-simple-maps)
- Travel-flow arcs: OpenFlights × Census county centroids (3221 counties, 5450 routes)
- Map hover reliability fixes (debounce, activeFips guard, pointerEvents fix)
- County detail panel: GET /api/county-detail/<fips>, Gemma synthesis
- One Health minimum dataset form (23 symptoms, 6 exposure, 4 severity, 2 environmental)
- AI prompt overhauled with labeled sections, high-signal flag auto-detection

### Mid-hackathon pass 4 — Claude — Gemma/Ollama migration + national scope
- Removed OpenAI GPT-4o entirely; all inference now via Gemma 4 / Ollama (local, offline, free)
- Removed all Google Gemini API code
- National app: removed all AZ defaults/hardcodes
  - CDC FluView: maps state → HHS region (10 regions + national fallback)
  - Neighbor spread: haversine distance filter (400 mi) — non-AZ counties no longer see AZ data
  - get_community_risk_map(): queries all counties with reports (not AZ_COUNTIES list)
  - zip_to_county() default → "Unknown" (not "Maricopa")
  - AI prompts: "national US" language
- County picker: replaced zip code input with searchable CountyPicker component
  - /api/counties endpoint: all 3,221 US counties sorted by state/name
  - Sends fips/county/state to backend; weather uses coords from ALL_COUNTIES
  - County list cached in localStorage for 24h
- save_report() now stores fips column for real user reports
- SYSTEM_PROMPT expanded: returns recommendations (list), self_care_tips, risk_factors_flagged, confidence
- Checkin response expanded: includes fluview, epicore, beacon, neighbor_spread, fips, state
- ResultsDashboard rebuilt: full county context panel, self-care tips with category icons, structured recommendations with priority badges, all surveillance data visible
- AIExplainer accordion restored ("How did we calculate this?" collapsed by default)

**NEXT STEPS:**
1. Get Epicore API base URL from organizers/Discord → add to .env
2. Deploy: `cd frontend && npm run build` → Vercel; backend → Railway (ensure Ollama accessible)
3. Set JWT_SECRET to a real secret in prod .env
4. Create GitHub README
5. Submit on Devpost 15 min before deadline
