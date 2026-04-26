from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import jwt as pyjwt
import math
import os
import json
import requests
import threading
import uuid

from database import (
    DB_PATH,
    init_db, save_report, zip_to_county, seed_demo_data, seed_new_england_outbreak, clear_demo_data, get_demo_status,
    init_users_db, create_user, get_user_by_email, get_user_by_id, get_user_by_username,
    update_user_streak, add_friend, remove_friend, get_friends, get_user_stats,
)
from forecast import detect_cluster, get_community_risk_map
from county_data import COUNTY_DATA
from travel_data import get_inbound_sources, airport_stats, ALL_COUNTIES

# FIPS → (lat, lon) for all US counties — used for geographic neighbor filtering
_COUNTY_COORDS = {fips: (info['lat'], info['lon']) for fips, info in ALL_COUNTIES.items()}

# Gemma 4 prediction model (optional - requires Ollama running)
try:
    from gemma_model import get_predictor as get_gemma
    GEMMA_AVAILABLE = False  # Will be set to True after health check
except ImportError:
    get_gemma = None
    GEMMA_AVAILABLE = False

load_dotenv()

from openai import OpenAI as _OpenAI
_openai_client = None

def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        key = os.getenv("OPENAI_API_KEY")
        if key:
            _openai_client = _OpenAI(api_key=key)
    return _openai_client

app = Flask(__name__)
CORS(app)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

@app.before_request
def handle_options():
    from flask import request as req
    if req.method == "OPTIONS":
        from flask import Response
        r = Response()
        r.headers["Access-Control-Allow-Origin"] = "*"
        r.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return r

os.makedirs("static/audio", exist_ok=True)

with open("data/az_health_baseline.json") as f:
    HEALTH_BASELINE = json.load(f)

JWT_SECRET = os.getenv("JWT_SECRET", "cp-dev-secret-change-in-prod")

# In-memory store for async AI jobs: job_id → {"status": "pending"|"done", "result": dict|None}
_AI_JOBS: dict = {}
_AI_JOBS_LOCK = threading.Lock()

# In-memory TTL cache for expensive external API calls
import time as _time
_API_CACHE: dict = {}
_CACHE_TTL = {"weather": 600, "fluview": 3600}  # seconds


def _cache_get(key: str, kind: str):
    entry = _API_CACHE.get(key)
    if entry and (_time.time() - entry[1]) < _CACHE_TTL[kind]:
        return entry[0]
    return None


def _cache_set(key: str, value):
    _API_CACHE[key] = (value, _time.time())

init_db()
init_users_db()

# Initialize Gemma model via Ollama
if get_gemma:
    try:
        gemma = get_gemma()
        if gemma.health_check():
            GEMMA_AVAILABLE = True
            print("✅ Gemma 4 model available - Using LOCAL OLLAMA (offline, free)")
        else:
            print("⚠️  No Gemma backend available — start Ollama: ollama serve && ollama pull gemma4:e2b")
    except Exception as e:
        print(f"⚠️  Gemma initialization failed: {e}")


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            return jsonify({"error": "Token required"}), 401
        try:
            payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user = get_user_by_id(payload["user_id"])
            if not user:
                return jsonify({"error": "User not found"}), 401
        except pyjwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except Exception:
            return jsonify({"error": "Invalid token"}), 401
        return f(user, *args, **kwargs)
    return decorated


def optional_auth(f):
    """Like token_required but passes None if no/invalid token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        user = None
        if token:
            try:
                payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                user = get_user_by_id(payload["user_id"])
            except Exception:
                pass
        return f(user, *args, **kwargs)
    return decorated


def make_token(user_id):
    import datetime
    payload = {
        "user_id": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=30),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

SYSTEM_PROMPT = """You are a One Health disease risk model for CommunityPulse. Analyze the report and return ONLY a valid JSON object — no markdown, no extra text.

Assess: symptom severity, household spread, exposure flags (tick/animal bite → vector/zoonotic, flooding → waterborne, mass event → droplet, sick contact → direct), community trend, travel inflow risk, weather amplification.

Risk scale (must match the county map panel):
- low: mild symptoms, no spread signal, low community trend
- medium: moderate symptoms OR community trend growing OR travel inflow active
- high: severe symptoms OR cluster crossed OR multiple risk factors
- severe: critical exposure (animal bite/tick + fever, flooding + GI, sought emergency care) AND active community spread

Return this JSON exactly:
{"risk_level":"low|medium|high|severe","recommendation":"2-3 sentences specific to their symptoms and community data. End: This is not medical advice — consult a healthcare provider.","recommendations":[{"action":"specific step","priority":"urgent|high|moderate|low","reason":"why given their data"}],"self_care_tips":[{"tip":"one actionable sentence tailored to their symptoms","category":"hydration|rest|symptom relief|nutrition|monitoring|prevention|when to seek care"}],"notify_others":true,"notify_message":"brief contact alert","ai_explanation":"list data points that drove risk level","risk_factors_flagged":["signal 1","signal 2"],"wellness_tip":"location/weather tip or empty string if sick","confidence":"low|medium|high","confidence_note":"one sentence on reliability"}

Tips rules: 4-5 tips tailored to reported symptoms (fever→fluids+rest; cough→steam; sore throat→warm fluids; nausea→bland diet). Add one weather tip. Add one "when to seek care" tip with warning signs specific to their symptoms."""


def get_weather(zip_code):
    key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not key:
        return {"temp": "N/A", "conditions": "unavailable"}
    try:
        url = (
            f"http://api.openweathermap.org/data/2.5/weather"
            f"?zip={zip_code},us&appid={key}&units=imperial"
        )
        r = requests.get(url, timeout=5)
        data = r.json()
        return {
            "temp": round(data["main"]["temp"]),
            "feels_like": round(data["main"].get("feels_like", data["main"]["temp"])),
            "conditions": data["weather"][0]["description"],
            "humidity": data["main"].get("humidity"),
        }
    except Exception:
        return {"temp": "N/A", "conditions": "unavailable"}


def get_weather_by_coords(lat, lon):
    key = os.getenv("OPENWEATHERMAP_API_KEY")
    if not key:
        return {"temp": "N/A", "conditions": "unavailable"}
    try:
        url = (
            f"http://api.openweathermap.org/data/2.5/weather"
            f"?lat={lat}&lon={lon}&appid={key}&units=imperial"
        )
        r = requests.get(url, timeout=5)
        data = r.json()
        return {
            "temp": round(data["main"]["temp"]),
            "feels_like": round(data["main"].get("feels_like", data["main"]["temp"])),
            "conditions": data["weather"][0]["description"],
            "humidity": data["main"].get("humidity"),
        }
    except Exception:
        return {"temp": "N/A", "conditions": "unavailable"}


_STATE_TO_HHS = {
    "CT":"hhs1","ME":"hhs1","MA":"hhs1","NH":"hhs1","RI":"hhs1","VT":"hhs1",
    "NJ":"hhs2","NY":"hhs2",
    "DE":"hhs3","MD":"hhs3","PA":"hhs3","VA":"hhs3","WV":"hhs3","DC":"hhs3",
    "AL":"hhs4","FL":"hhs4","GA":"hhs4","KY":"hhs4","MS":"hhs4","NC":"hhs4","SC":"hhs4","TN":"hhs4",
    "IL":"hhs5","IN":"hhs5","MI":"hhs5","MN":"hhs5","OH":"hhs5","WI":"hhs5",
    "AR":"hhs6","LA":"hhs6","NM":"hhs6","OK":"hhs6","TX":"hhs6",
    "IA":"hhs7","KS":"hhs7","MO":"hhs7","NE":"hhs7",
    "CO":"hhs8","MT":"hhs8","ND":"hhs8","SD":"hhs8","UT":"hhs8","WY":"hhs8",
    "AZ":"hhs9","CA":"hhs9","HI":"hhs9","NV":"hhs9",
    "AK":"hhs10","ID":"hhs10","OR":"hhs10","WA":"hhs10",
}

_HHS_STATES = {
    "hhs1":"CT/ME/MA/NH/RI/VT","hhs2":"NJ/NY","hhs3":"DE/MD/PA/VA/WV/DC",
    "hhs4":"AL/FL/GA/KY/MS/NC/SC/TN","hhs5":"IL/IN/MI/MN/OH/WI",
    "hhs6":"AR/LA/NM/OK/TX","hhs7":"IA/KS/MO/NE",
    "hhs8":"CO/MT/ND/SD/UT/WY","hhs9":"AZ/NV/CA/HI","hhs10":"AK/ID/OR/WA",
}


def get_cdc_fluview(state: str = None):
    """Fetch CDC FluView ILI data for the HHS region matching the given state, or national if unknown."""
    if state and state in _STATE_TO_HHS:
        region = _STATE_TO_HHS[state]
        region_display = f"HHS Region {region.replace('hhs', '')} ({_HHS_STATES[region]})"
    else:
        region = "nat"
        region_display = "National"
    try:
        from datetime import date
        year = date.today().year
        r = requests.get(
            f"https://api.delphi.cmu.edu/epidata/fluview/?regions={region}&epiweeks={year}01-{year}52",
            timeout=6,
        )
        if r.status_code == 200:
            data = r.json()
            epidata = data.get("epidata", [])
            if epidata:
                latest = sorted(epidata, key=lambda x: x.get("epiweek", 0))[-1]
                ili = round(latest.get("ili", 0), 2)
                wili = round(latest.get("wili", 0), 2)
                week = latest.get("epiweek", "N/A")
                level = "elevated" if wili > 2.5 else "baseline"
                return (
                    f"CDC FluView {region_display}: ILI rate {ili}%, "
                    f"weighted {wili}% ({level}) — epiweek {week}"
                )
    except Exception as e:
        print(f"FluView error: {e}")
    return "CDC FluView: data temporarily unavailable"


def get_epicore_events(base_url=None):
    """
    Query the Epicore API for verified outbreak events in the past 60 days.
    Hub is at epihack.org/arizona — API base is https://epihack.org
    Override with EPICORE_API_URL env var if needed.
    """
    try:
        from datetime import date, timedelta
        url = base_url or os.getenv("EPICORE_API_URL", "https://epihack.org/api/events/closed")
        end = date.today().isoformat()
        start = (date.today() - timedelta(days=60)).isoformat()
        r = requests.get(url, params={"start_date": start, "end_date": end}, timeout=8)
        if r.status_code == 200:
            data = r.json()
            events = data.get("EventsList", {}).get("all", [])
            if not events:
                return "Epicore: no verified events in past 60 days."
            us_vp = [e for e in events if "United States" in e.get("country", "") and e.get("outcome") == "VP"]
            relevant = us_vp[:3] if us_vp else [e for e in events if e.get("outcome") == "VP"][:3]
            if not relevant:
                relevant = events[:2]
            summaries = [
                f"{e.get('phe_description','?')} in {e.get('country','?')} ({e.get('outcome','?')}, {e.get('action_date','')})"
                for e in relevant
            ]
            return "Epicore verified events: " + "; ".join(summaries)
        print(f"Epicore HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"Epicore error: {e}")
    return "Epicore: no verified event data available."


def get_beacon_signals():
    """
    Query BEACON (Biosurveillance Ecosystem) for recent outbreak signals.
    Source: beacon.phiresearchlab.org — documented in EpiHack participant hub.
    """
    try:
        from datetime import date, timedelta
        end = date.today().isoformat()
        start = (date.today() - timedelta(days=30)).isoformat()
        r = requests.get(
            "https://beacon.phiresearchlab.org/api/v1/events",
            params={"start_date": start, "end_date": end, "country": "US"},
            timeout=8,
        )
        if r.status_code == 200:
            data = r.json()
            events = data if isinstance(data, list) else data.get("events", data.get("results", []))
            if events:
                top = events[:3]
                summaries = [
                    f"{e.get('disease', e.get('title', '?'))} — {e.get('location', e.get('country', '?'))}"
                    for e in top
                ]
                return "BEACON biosurveillance: " + "; ".join(summaries)
            return "BEACON: no active US signals in past 30 days."
        print(f"BEACON HTTP {r.status_code}")
    except Exception as e:
        print(f"BEACON error: {e}")
    return "BEACON: biosurveillance data unavailable."


def get_who_alerts():
    """
    Fetch WHO Disease Outbreak News (public API, no key required).
    Returns list of recent alert dicts for display + AI context.
    """
    try:
        r = requests.get(
            "https://www.who.int/api/news/diseaseoutbreaknews",
            params={"sf_culture": "en", "pageIndex": 0, "pageSize": 5},
            timeout=8,
            headers={"Accept": "application/json"},
        )
        if r.status_code == 200:
            data = r.json()
            items = data.get("value", data) if isinstance(data, dict) else data
            if isinstance(items, list) and items:
                alerts = []
                for item in items[:4]:
                    title = item.get("Title", item.get("title", ""))
                    date_str = (item.get("PublicationDate", item.get("publicationDate", "")) or "")[:10]
                    url = item.get("Url", item.get("url", ""))
                    if title:
                        alerts.append({"title": title, "date": date_str, "url": url})
                return alerts
    except Exception as e:
        print(f"WHO alerts error: {e}")
    return []


def get_outbreaks_near_me(state="AZ"):
    """
    Pull recent US outbreak alerts from HealthMap (the data source behind OutbreaksNearMe.org).
    Falls back to ProMED RSS if HealthMap is unavailable.
    """
    try:
        import xml.etree.ElementTree as ET
        # ProMED public RSS — structured outbreak reports used by HealthMap
        r = requests.get(
            "https://www.promedmail.org/feed/",
            timeout=8,
            headers={"User-Agent": "CommunityPulse/1.0"},
        )
        if r.status_code == 200:
            root = ET.fromstring(r.content)
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            items = root.findall(".//item")
            alerts = []
            for item in items[:6]:
                title_el = item.find("title")
                link_el  = item.find("link")
                date_el  = item.find("pubDate")
                if title_el is not None and title_el.text:
                    alerts.append({
                        "title": title_el.text.strip(),
                        "date":  (date_el.text or "")[:16] if date_el is not None else "",
                        "url":   link_el.text.strip() if link_el is not None else "",
                        "source": "ProMED / OutbreaksNearMe",
                    })
            if alerts:
                return alerts
    except Exception as e:
        print(f"OutbreaksNearMe/ProMED error: {e}")
    return []


def text_to_speech(text):
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        return None
    try:
        voice_id = "21m00Tcm4TlvDq8ikWAM"  # Rachel — clear, professional
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {"xi-api-key": key, "Content-Type": "application/json"}
        body = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        r = requests.post(url, json=body, headers=headers, timeout=15)
        if r.status_code == 200:
            path = "static/audio/output.mp3"
            with open(path, "wb") as f:
                f.write(r.content)
            return "/static/audio/output.mp3"
    except Exception:
        pass
    return None


def build_user_prompt(data, county, state, cluster, weather, epicore, fluview, beacon, baseline, neighbor_spread="", travel_sources=0):
    symptoms = data.get("symptoms", [])
    feeling = data.get("feeling", "sick")
    sex = data.get("sex") or "not specified"
    hh_members = int(data.get("household_members", 1))
    hh_sick = int(data.get("sick_household_members", 0))
    hh_sick_pct = round(hh_sick / hh_members * 100) if hh_members else 0

    red_flags = []
    if data.get("animal_bite"):            red_flags.append("ANIMAL BITE — zoonotic pathway")
    if data.get("tick_insect_bite"):       red_flags.append("TICK/INSECT BITE — vector-borne pathway")
    if data.get("contact_sick_individual"):red_flags.append("CONTACT WITH CONFIRMED CASE — direct transmission")
    if data.get("sought_healthcare"):      red_flags.append("SOUGHT HEALTHCARE — elevated severity")
    if data.get("flooding"):               red_flags.append("FLOODING — waterborne risk")
    if hh_sick_pct >= 50:                  red_flags.append(f"HIGH HOUSEHOLD SICK RATE: {hh_sick}/{hh_members} members ill")

    weather_str = (
        f"{weather.get('temp','N/A')}°F, feels like {weather.get('feels_like','N/A')}°F, "
        f"{weather.get('conditions','unavailable')}, {weather.get('humidity','?')}% humidity"
    )

    return f"""=== INDIVIDUAL HEALTH REPORT ===
Feeling: {feeling}
Symptoms: {', '.join(symptoms) if symptoms else 'none'}
Location: {county} County, {state}
Age group: {data.get('age_group','adult')} | Sex: {sex}
Household: {hh_members} total, {hh_sick} sick ({hh_sick_pct}% sick rate)
First occurrence of these symptoms: {'yes' if data.get('first_time_reporting') else 'no'}

=== ONE HEALTH EXPOSURE FACTORS ===
  Recent travel (past 2 weeks):           {'YES' if data.get('recent_travel') else 'no'}
  Attended mass gathering:                {'YES' if data.get('event_attendance') else 'no'}
  Tick or insect bite:                    {'YES' if data.get('tick_insect_bite') else 'no'}
  Animal bite:                            {'YES' if data.get('animal_bite') else 'no'}
  Contact with live animals/livestock:    {'YES' if data.get('animal_contact') else 'no'}
  Contact with sick/confirmed case:       {'YES' if data.get('contact_sick_individual') else 'no'}

=== SEVERITY INDICATORS ===
  Absent from work:         {'YES' if data.get('absent_from_work') else 'no'}
  Absent from school:       {'YES' if data.get('absent_from_school') else 'no'}
  Sought healthcare:        {'YES' if data.get('sought_healthcare') else 'no'}
  Reported to authority:    {'YES' if data.get('reporting_to_authority') else 'no'}

=== ENVIRONMENTAL FACTORS ===
  Water contamination concerns:  {'YES' if data.get('water_concerns') else 'no'}
  Flooding in area:              {'YES' if data.get('flooding') else 'no'}
  Sick animals nearby:           {'YES' if data.get('sick_animals', 0) > 0 else 'no'}

{('=== HIGH-SIGNAL FLAGS ===\n' + '\n'.join(f'  !! {f}' for f in red_flags) + '\n') if red_flags else ''}
=== COMMUNITY SURVEILLANCE — {county.upper()} COUNTY (past 72h) ===
  Reports in window:     {cluster['report_count']}
  Week-over-week trend:  {cluster['trend_pct']:+}% ({'GROWING' if cluster['trend_pct'] > 10 else ('declining' if cluster['trend_pct'] < -10 else 'stable')})
  Cluster threshold:     {'CROSSED' if cluster['is_cluster'] else 'not crossed'}
  7-day forecast:        {cluster['forecast']}
  County baseline:       {baseline.get('notes','')}

=== NEIGHBORING COUNTY SPREAD ===
{neighbor_spread or 'No elevated illness in surrounding counties'}

=== INBOUND TRAVEL RISK ===
  Counties with direct flights reporting active illness: {travel_sources}
  {'(travel inflow signal — elevated importation risk)' if travel_sources > 3 else '(low travel inflow)'}

=== WEATHER & EXTERNAL SURVEILLANCE ===
  Weather:   {weather_str}
  {fluview}
  {epicore}
  {beacon}
"""


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d = (math.sin((phi2 - phi1) / 2) ** 2
         + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians((lon2 - lon1) / 2)) ** 2)
    return 3958.8 * 2 * math.asin(math.sqrt(d))


def _call_openai_json(system_prompt: str, user_prompt: str, model: str = "gpt-4o") -> dict | None:
    """Call OpenAI and parse the JSON response."""
    client = _get_openai_client()
    if not client:
        return None
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            timeout=30,
        )
        text = response.choices[0].message.content
        return json.loads(text)
    except Exception as e:
        print(f"OpenAI error: {e}")
        return None


def _call_gemma_json(system_prompt: str, user_prompt: str) -> dict | None:
    """Send a prompt to Gemma via Ollama and parse the JSON response."""
    if not GEMMA_AVAILABLE or not gemma:
        return None
    text = gemma.generate(user_prompt, temperature=0.4, system=system_prompt)
    if not text:
        return None
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception as e:
        print(f"Gemma JSON parse error: {e}\nRaw: {text[:300]}")
    return None


def _get_weather_cached(lat: float, lon: float) -> dict:
    key = f"weather:{lat:.2f},{lon:.2f}"
    cached = _cache_get(key, "weather")
    if cached is not None:
        return cached
    result = get_weather_by_coords(lat, lon)
    _cache_set(key, result)
    return result


def _get_fluview_cached(state: str) -> str:
    key = f"fluview:{state}"
    cached = _cache_get(key, "fluview")
    if cached is not None:
        return cached
    result = get_cdc_fluview(state=state or None)
    _cache_set(key, result)
    return result


def _get_county_spread_context(
    exclude_county: str = "",
    lat: float = None,
    lon: float = None,
    max_miles: float = 400,
) -> str:
    """
    Returns elevated-illness counties within max_miles of the target county.
    When lat/lon are omitted, no distance filter is applied (all counties returned).
    """
    try:
        risk_map = get_community_risk_map()

        def in_range(entry: dict) -> bool:
            if lat is None or lon is None:
                return True
            coords = _COUNTY_COORDS.get(entry.get("fips", ""))
            return bool(coords) and _haversine_miles(lat, lon, coords[0], coords[1]) <= max_miles

        high   = [r for r in risk_map if r["risk_level"] == "high"   and r["county"] != exclude_county and in_range(r)]
        medium = [r for r in risk_map if r["risk_level"] == "medium" and r["county"] != exclude_county and in_range(r)]
        lines = []
        if high:
            lines.append("HIGH illness: " + ", ".join(
                f"{r['county']} ({r['report_count']} reports, {r['trend_pct']:+.0f}% trend)"
                for r in high[:6]
            ))
        if medium:
            lines.append("MEDIUM illness: " + ", ".join(
                f"{r['county']} ({r['report_count']} reports)"
                for r in medium[:6]
            ))
        return "\n".join(lines) if lines else "No elevated illness in nearby counties"
    except Exception:
        return "County spread data unavailable"


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify({"error": "username, email, and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if get_user_by_email(email):
        return jsonify({"error": "Email already registered"}), 409
    if get_user_by_username(username):
        return jsonify({"error": "Username already taken"}), 409

    pw_hash = generate_password_hash(password)
    user_id = create_user(username, email, pw_hash)
    token = make_token(user_id)
    return jsonify({"token": token, "user": {"id": user_id, "username": username, "streak": 0}}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = get_user_by_email(email)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    token = make_token(user["id"])
    return jsonify({
        "token": token,
        "user": {"id": user["id"], "username": user["username"], "streak": user["streak"]},
    })


@app.route("/api/auth/me", methods=["GET"])
@token_required
def me(current_user):
    return jsonify({
        "id": current_user["id"],
        "username": current_user["username"],
        "streak": current_user["streak"],
        "last_checkin": current_user["last_checkin"],
    })


@app.route("/api/profile", methods=["GET"])
@token_required
def profile(current_user):
    stats = get_user_stats(current_user["id"])
    return jsonify(stats)


# ── Friends & Leaderboard ─────────────────────────────────────────────────────

@app.route("/api/friends", methods=["GET"])
@token_required
def friends_list(current_user):
    friends = get_friends(current_user["id"])
    return jsonify(friends)


@app.route("/api/friends/add", methods=["POST"])
@token_required
def friends_add(current_user):
    data = request.get_json()
    username = (data.get("username") or "").strip()
    if not username:
        return jsonify({"error": "username required"}), 400
    if username == current_user["username"]:
        return jsonify({"error": "You can't add yourself"}), 400

    friend = get_user_by_username(username)
    if not friend:
        return jsonify({"error": f"No user found with username '{username}'"}), 404

    add_friend(current_user["id"], friend["id"])
    return jsonify({"message": f"Added {username} as a friend", "friend": {
        "id": friend["id"], "username": friend["username"], "streak": friend["streak"],
    }})


@app.route("/api/friends/remove", methods=["POST"])
@token_required
def friends_remove(current_user):
    data = request.get_json()
    username = (data.get("username") or "").strip()
    friend = get_user_by_username(username)
    if not friend:
        return jsonify({"error": "User not found"}), 404
    remove_friend(current_user["id"], friend["id"])
    return jsonify({"message": f"Removed {username}"})


@app.route("/api/leaderboard", methods=["GET"])
@token_required
def leaderboard(current_user):
    friends = get_friends(current_user["id"])
    # Include the current user in the leaderboard
    all_users = [
        {"id": current_user["id"], "username": current_user["username"],
         "streak": current_user["streak"], "is_me": True}
    ] + [
        {**f, "is_me": False} for f in friends
    ]
    all_users.sort(key=lambda u: u["streak"], reverse=True)
    # Add rank
    for i, u in enumerate(all_users):
        u["rank"] = i + 1
    return jsonify(all_users)


@app.route("/api/checkin", methods=["POST"])
@optional_auth
def checkin(current_user):
    data = request.get_json()
    # Accept fips/county/state directly (county picker) or fall back to zip (legacy)
    fips  = data.get("fips", "")
    county = data.get("county") or zip_to_county(data.get("zip_code", ""))
    state  = data.get("state", "")
    if not state:
        county_meta = COUNTY_DATA.get(data.get("zip_code", ""))
        state = county_meta[1] if county_meta else ""
    feeling = data.get("feeling", "sick")

    save_report(data, county, user_id=current_user["id"] if current_user else None, fips=fips)

    cluster = detect_cluster(county)
    # Use precise coords when fips is known, otherwise fall back to zip-based weather
    if fips and fips in ALL_COUNTIES:
        ci = ALL_COUNTIES[fips]
        weather = get_weather_by_coords(ci["lat"], ci["lon"])
    else:
        weather = get_weather(data.get("zip_code", ""))
    # epicore and beacon: kept in codebase, not called until APIs go live at event
    epicore = ""
    beacon  = ""
    fluview = get_cdc_fluview(state=state or None)
    who_alerts = get_who_alerts()
    outbreaks_near_me = get_outbreaks_near_me(state or "US")
    baseline = HEALTH_BASELINE.get(county, HEALTH_BASELINE["default"])

    neighbor_spread = _get_county_spread_context(exclude_county=county)
    # Get travel inflow count (pre-computed, fast) so checkin sees the same signal as the county panel
    import sqlite3 as _sq
    _conn = _sq.connect(DB_PATH); _c = _conn.cursor()
    _c.execute("SELECT fips, COUNT(*) FROM reports WHERE feeling='sick' AND fips IS NOT NULL AND fips!='' AND fips!=? AND timestamp>=datetime('now','-7 days') GROUP BY fips", (fips,))
    _sick_by_fips = {r[0]: r[1] for r in _c.fetchall()}; _conn.close()
    travel_count = len(get_inbound_sources(fips, _sick_by_fips).get("sources", [])) if fips else 0
    user_prompt = build_user_prompt(data, county, state, cluster, weather, epicore, fluview, beacon, baseline, neighbor_spread, travel_sources=travel_count)

    location_str = f"{county} County{', ' + state if state else ''}"
    rl = "high" if cluster["is_cluster"] else ("medium" if cluster["report_count"] > 5 else "low")
    fast_result = {
        "risk_level": rl,
        "recommendation": (
            f"Based on {cluster['report_count']} similar reports in {location_str} "
            f"and a {abs(cluster['trend_pct'])}% {'increase' if cluster['trend_pct'] > 0 else 'decrease'} "
            f"in illness reports this week, please monitor your symptoms closely and stay home if unwell. "
            f"This is not medical advice — consult a healthcare provider."
        ),
        "recommendations": [],
        "self_care_tips": [],
        "notify_others": cluster["is_cluster"],
        "notify_message": (
            f"Hey — CommunityPulse detected a potential illness cluster in {location_str}. "
            f"Please take precautions and stay safe!"
        ),
        "ai_explanation": f"GPT-4o is generating a personalized analysis…",
        "risk_factors_flagged": (
            (["Illness cluster detected in county"] if cluster["is_cluster"] else []) +
            ([f"County trend: {cluster['trend_pct']:+.0f}%"] if abs(cluster['trend_pct']) > 10 else [])
        ) or ["No high-signal risk factors detected"],
        "wellness_tip": "",
        "confidence": "low" if cluster["report_count"] < 5 else ("medium" if cluster["report_count"] < 20 else "high"),
        "confidence_note": f"Based on {cluster['report_count']} reports in past 72h.",
        "ai_pending": True,
    }

    # Launch OpenAI analysis in background
    job_id = str(uuid.uuid4())
    with _AI_JOBS_LOCK:
        _AI_JOBS[job_id] = {"status": "pending", "result": None}

    _captured_prompt = user_prompt  # already built above via build_user_prompt()

    def _run_ai(jid, up):
        ai_result = _call_openai_json(SYSTEM_PROMPT, up)
        recs  = (ai_result or {}).get("recommendations") or [
            {"action": "Stay home and rest if you have symptoms", "priority": "high", "reason": "Prevent community spread"},
            {"action": "Monitor symptoms for 24-48 hours", "priority": "high", "reason": "Watch for deterioration"},
            {"action": "Wash hands frequently and avoid close contact", "priority": "moderate", "reason": "Reduce transmission risk"},
            {"action": "Consult a healthcare provider if symptoms worsen", "priority": "high", "reason": "Early treatment improves outcomes"},
        ]
        tips  = (ai_result or {}).get("self_care_tips") or [
            {"tip": "Drink plenty of fluids to stay hydrated.", "category": "hydration"},
            {"tip": "Rest as much as possible.", "category": "rest"},
            {"tip": "Take over-the-counter fever reducers if temperature exceeds 101°F.", "category": "symptom relief"},
            {"tip": "Eat small, easy-to-digest meals.", "category": "nutrition"},
            {"tip": "Seek care if you develop difficulty breathing, persistent chest pain, or high fever above 103°F.", "category": "when to seek care"},
        ]
        with _AI_JOBS_LOCK:
            _AI_JOBS[jid] = {
                "status": "done",
                "result": {
                    "recommendations": recs,
                    "self_care_tips": tips,
                    "risk_level":     (ai_result or {}).get("risk_level"),
                    "recommendation": (ai_result or {}).get("recommendation"),
                    "notify_others":  (ai_result or {}).get("notify_others"),
                    "notify_message": (ai_result or {}).get("notify_message"),
                    "ai_explanation": (ai_result or {}).get("ai_explanation"),
                    "wellness_tip":   (ai_result or {}).get("wellness_tip"),
                    "ai_pending": False,
                }
            }

    threading.Thread(target=_run_ai, args=(job_id, _captured_prompt), daemon=True).start()

    # Update server-side streak if user is logged in
    server_streak = None
    if current_user:
        server_streak = update_user_streak(current_user["id"])

    return jsonify({
        **fast_result,
        "cluster": cluster,
        "county": county,
        "state": state,
        "fips": fips,
        "audio_url": None,
        "weather": weather,
        "fluview": fluview,
        "epicore": epicore,
        "beacon": beacon,
        "who_alerts": who_alerts,
        "outbreaks_near_me": outbreaks_near_me,
        "neighbor_spread": neighbor_spread,
        "server_streak": server_streak,
        "ai_job_id": job_id,
    })


@app.route("/api/ai-result/<job_id>", methods=["GET"])
def ai_result(job_id):
    with _AI_JOBS_LOCK:
        job = _AI_JOBS.get(job_id)
    if not job:
        return jsonify({"status": "not_found"}), 404
    if job["status"] == "pending":
        return jsonify({"status": "pending"})
    # Clean up completed job after retrieval
    with _AI_JOBS_LOCK:
        _AI_JOBS.pop(job_id, None)
    if job["status"] == "error" or "result" not in job:
        return jsonify({"status": "error", "error": job.get("error", "AI analysis failed")})
    return jsonify({"status": "done", "result": job["result"]})


@app.route("/api/counties", methods=["GET"])
def counties_list():
    """All US counties for the county picker — sorted by state then name."""
    result = sorted(
        [{"fips": fips, "county": info["county"], "state": info["state"]}
         for fips, info in ALL_COUNTIES.items()],
        key=lambda x: (x["state"], x["county"])
    )
    return jsonify(result)


@app.route("/api/community-risk", methods=["GET"])
def community_risk():
    return jsonify(get_community_risk_map())


def run_sir_simulation(population, infected_0, r_effective, days=60, infectious_period=5):
    """
    Forward SIR simulation using Euler integration.
    Returns list of {day, S, I, R, I_pct} dicts.

    Parameters
    ----------
    population      : total county population (N)
    infected_0      : estimated current active infections (I₀)
    r_effective     : Rₑ — effective reproduction number
    days            : simulation horizon
    infectious_period: average days infectious (γ = 1/infectious_period)
    """
    N   = max(population, 1)
    gamma = 1.0 / infectious_period          # recovery rate
    beta  = r_effective * gamma              # transmission rate

    # Seed: assume ~10x reported are actually infected (underreporting)
    I = min(max(infected_0 * 10, 1), N * 0.01)
    # Assume 20% of population has prior immunity (prior exposure / vaccination)
    R = N * 0.20
    S = max(N - I - R, 0)

    curve = []
    peak_day  = 0
    peak_I    = I

    for day in range(days + 1):
        curve.append({
            "day": day,
            "S": round(S),
            "I": round(I),
            "R": round(R),
            "I_pct": round(I / N * 100, 3),
        })
        if I > peak_I:
            peak_I   = I
            peak_day = day

        # Euler step
        dS = -beta * S * I / N
        dI =  beta * S * I / N - gamma * I
        dR =  gamma * I

        S = max(S + dS, 0)
        I = max(I + dI, 0)
        R = min(R + dR, N)

        if I < 0.5 and day > 7:
            # Pad remainder with zeros
            for d in range(day + 1, days + 1):
                curve.append({"day": d, "S": round(S), "I": 0, "R": round(N - S), "I_pct": 0.0})
            break

    herd_threshold = round((1 - 1 / max(r_effective, 0.01)) * 100, 1) if r_effective > 1 else None

    return {
        "curve": curve,
        "peak_day": peak_day,
        "peak_infected": round(peak_I),
        "peak_pct": round(peak_I / N * 100, 2),
        "total_infected": round(N - S),
        "herd_immunity_threshold_pct": herd_threshold,
        "parameters": {
            "N": N, "beta": round(beta, 4), "gamma": round(gamma, 4),
            "r_effective": r_effective, "infectious_period": infectious_period,
        },
    }


OUTBREAK_PREDICTION_SYSTEM = """You are an epidemiologist running an outbreak risk forecast for CommunityPulse, a One Health participatory surveillance platform.

Using the data provided, produce a structured epidemic risk forecast. Think like an epidemiologist:
- Estimate the effective reproduction number (Rₑ) from the trend and sick rate
- Estimate doubling time from week-over-week growth
- Assess whether spread is being driven by travel inflow, local transmission, or environmental factors
- Rate outbreak probability on a 0-100 scale
- Forecast the 14-day trajectory

Return ONLY valid JSON — no markdown, no extra text:
{
  "outbreak_probability": <0-100 integer>,
  "epidemic_risk_level": "low|moderate|high|critical",
  "r_effective": <float, e.g. 1.4>,
  "doubling_days": <integer or null if declining>,
  "trajectory": "declining|stable|growing|accelerating",
  "days_to_threshold": <integer days until cluster threshold crossed, or null if already crossed or not on track>,
  "primary_driver": "local_transmission|travel_inflow|environmental|multiple",
  "key_factors": ["factor 1", "factor 2", "factor 3"],
  "forecast_narrative": "2-3 sentences explaining the 14-day outlook. Cite specific data points.",
  "public_health_actions": ["action 1", "action 2", "action 3"],
  "confidence": "low|medium|high",
  "confidence_note": "One sentence on what limits or supports this forecast."
}"""


@app.route("/api/outbreak-prediction/<target_fips>", methods=["GET"])
def outbreak_prediction(target_fips):
    """
    Phase 1: instant math response with SIR model + rule-based prediction + ai_job_id.
    Phase 2: background thread fetches WHO/Epicore/Weather in parallel, then calls Gemma.
    """
    import sqlite3

    county_info = ALL_COUNTIES.get(target_fips)
    if not county_info:
        return jsonify({"error": "County not found"}), 404

    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()

    c.execute("""
        SELECT date(timestamp) as day, COUNT(*) as cnt
        FROM reports
        WHERE fips = ? AND feeling = 'sick'
          AND timestamp >= datetime('now', '-14 days')
        GROUP BY day ORDER BY day
    """, (target_fips,))
    daily_sick = c.fetchall()

    c.execute("""
        SELECT feeling, COUNT(*) as cnt FROM reports
        WHERE fips = ? AND timestamp >= datetime('now', '-7 days')
        GROUP BY feeling
    """, (target_fips,))
    week_totals = {row[0]: row[1] for row in c.fetchall()}

    c.execute("""
        SELECT COUNT(*) FROM reports
        WHERE fips = ? AND feeling = 'sick'
          AND timestamp >= datetime('now', '-14 days')
          AND timestamp < datetime('now', '-7 days')
    """, (target_fips,))
    prior_week_sick = c.fetchone()[0] or 0

    c.execute("""
        SELECT fips, COUNT(*) FROM reports
        WHERE feeling='sick' AND fips IS NOT NULL AND fips!=''
          AND fips != ? AND timestamp >= datetime('now','-7 days')
        GROUP BY fips
    """, (target_fips,))
    sick_by_fips = {row[0]: row[1] for row in c.fetchall()}
    conn.close()

    sick_7d   = week_totals.get("sick", 0)
    total_7d  = sum(week_totals.values())
    reporter_sick_pct = sick_7d / total_7d if total_7d > 0 else 0  # fraction among reporters only
    trend_pct = round((sick_7d - prior_week_sick) / max(prior_week_sick, 1) * 100)

    generation_time = 5
    sufficient_data = prior_week_sick >= 3 and sick_7d >= 3
    if sufficient_data:
        weekly_ratio = sick_7d / prior_week_sick
        r_est = round(weekly_ratio ** (generation_time / 7), 2)
    else:
        # Insufficient prior-week data — cannot estimate Rₑ from trend
        r_est = None

    doubling_days = (
        round(math.log(2) / math.log(r_est) * generation_time)
        if r_est is not None and r_est > 1.01 else None
    )

    travel        = get_inbound_sources(target_fips, sick_by_fips)
    travel_sources = travel.get("sources", [])

    neighbor_ctx = _get_county_spread_context(
        exclude_county=county_info["county"],
        lat=county_info["lat"], lon=county_info["lon"],
        max_miles=200,
    )

    pop = county_info.get("pop", 0)
    reporting_rate_per_million = round(total_7d / max(pop, 1) * 1_000_000, 1)

    # ── Outbreak probability — based on growth signal, NOT self-reporter sick fraction ──
    # self-reporter sick fraction is NOT a population sick rate; don't use it as one.
    # Primary signal: week-over-week growth (Rₑ). Secondary: travel inflow. Tertiary: volume.
    if not sufficient_data:
        # Not enough data for trend-based estimate — conservative, volume-only signal
        base_prob = min(20, int(math.log1p(total_7d) * 4))
    else:
        r_contribution   = max(0, (r_est - 1.0)) * 50   # Rₑ=1.5 → +25; Rₑ=2 → +50
        trend_fine       = max(0, trend_pct) * 0.15      # gentle trend bonus
        base_prob = min(70, max(5, int(r_contribution + trend_fine)))

    travel_bonus = min(15, len(travel_sources))  # 1 pt per source, max 15
    prob = min(90, max(5, base_prob + travel_bonus))

    # Risk level: only "high"/"critical" if Rₑ is actually > 1 with sufficient data
    if not sufficient_data:
        level = "moderate" if prob >= 20 else "low"
    else:
        level = "critical" if prob >= 75 else "high" if prob >= 50 else "moderate" if prob >= 25 else "low"

    trajectory = "growing" if trend_pct > 10 else ("declining" if trend_pct < -10 else "stable")
    r_display  = r_est if r_est is not None else "—"

    # Key factor bullets — honest about data quality
    key_factors = []
    if not sufficient_data:
        key_factors.append(f"Insufficient prior-week data to estimate Rₑ ({total_7d} reports this week, {prior_week_sick} last week)")
    else:
        key_factors.append(f"Rₑ ≈ {r_est} — {'growing' if r_est > 1 else 'stable or declining'}")
    key_factors.append(f"Week-over-week trend: {trend_pct:+}%")
    key_factors.append(f"{len(travel_sources)} counties with direct flights reporting illness")
    key_factors.append(f"Reporting rate: {reporting_rate_per_million} reports/million residents (self-selected sample)")

    rule_prediction = {
        "outbreak_probability": prob,
        "epidemic_risk_level": level,
        "r_effective": r_est,
        "doubling_days": doubling_days,
        "trajectory": trajectory,
        "days_to_threshold": None,
        "primary_driver": "travel_inflow" if len(travel_sources) > 3 else "local_transmission",
        "key_factors": key_factors,
        "forecast_narrative": (
            (f"Insufficient community data for a reliable forecast — only {total_7d} self-reports this week "
             f"({reporting_rate_per_million}/million residents). "
             f"Rₑ cannot be estimated reliably. "
             if not sufficient_data else
             f"{county_info['county']} County: Rₑ ≈ {r_est}, {trend_pct:+}% week-over-week. "
             f"{'Doubling every ~' + str(doubling_days) + ' days at current growth rate.' if doubling_days else 'Spread is not accelerating (Rₑ ≤ 1).'} "
            ) + "Full AI narrative loading..."
        ),
        "public_health_actions": [
            "Increase community surveillance check-ins",
            "Alert local public health department if trend continues",
            "Issue precautionary advisories to high-risk populations",
        ],
        "confidence": "low" if not sufficient_data or total_7d < 10 else "medium",
        "confidence_note": f"Based on {total_7d} self-reports in past 7 days.",
    }

    sir = run_sir_simulation(
        population=pop or 100_000,
        infected_0=max(sick_7d, 1),
        r_effective=r_est if r_est is not None else 1.0,
        days=60,
    )

    # Create async job for Gemma narrative
    job_id = str(uuid.uuid4())
    with _AI_JOBS_LOCK:
        _AI_JOBS[job_id] = {"status": "pending"}

    # Snapshot values needed in background thread
    _daily_sick    = daily_sick
    _sick_7d       = sick_7d
    _total_7d      = total_7d
    _prior_week    = prior_week_sick
    _travel_src    = travel_sources
    _neighbor_ctx  = neighbor_ctx
    _county_info   = county_info
    _target_fips   = target_fips
    _rate          = reporter_sick_pct
    _trend_pct     = trend_pct
    _r_est         = r_est
    _doubling_days = doubling_days

    def _run_outbreak_ai():
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def _fetch_who():
            return get_who_alerts()

        def _fetch_weather():
            return get_weather_by_coords(_county_info["lat"], _county_info["lon"])

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {
                executor.submit(_fetch_who):     "who",
                executor.submit(_fetch_weather): "weather",
            }
            results = {}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception:
                    results[key] = None

        who_alerts = results.get("who") or []
        epicore    = ""  # not called until event APIs go live
        weather    = results.get("weather") or {}

        daily_str = ", ".join(f"{d}: {n} sick" for d, n in _daily_sick) or "no data"
        user_prompt = f"""COUNTY: {_county_info['county']}, {_county_info['state']}
FIPS: {_target_fips}
Population: {_county_info.get('pop', 0):,}

SELF-REPORT DATA (past 14 days):
  Daily sick counts: {daily_str}
  Past 7 days: {_sick_7d} sick / {_total_7d} total ({_rate*100:.1f}% sick rate)
  Prior 7 days: {_prior_week} sick
  Week-over-week trend: {_trend_pct:+}%
  Estimated Rₑ: {_r_est} (generation time {generation_time} days)
  Doubling time: {f'{_doubling_days} days' if _doubling_days else 'N/A'}

TRAVEL INFLOW (past 7 days):
  Source counties: {len(_travel_src)}
{chr(10).join(f"  - {s['county']}, {s['state']}: {s['sick']} sick ({s['via_airport']}→{s['to_airport']})" for s in _travel_src[:5]) or "  None detected"}

NEIGHBORING COUNTY SPREAD (within 200 miles):
{_neighbor_ctx or "  No elevated illness nearby"}

WEATHER:
  {weather.get('temp','?')}°F, {weather.get('conditions','?')}, {weather.get('humidity','?')}% humidity

EXTERNAL SURVEILLANCE:
  {epicore}
  WHO alerts: {'; '.join(a['title'] for a in who_alerts[:2]) or 'none'}

Produce the epidemic outbreak forecast JSON."""

        prediction = _call_gemma_json(OUTBREAK_PREDICTION_SYSTEM, user_prompt)

        if prediction:
            with _AI_JOBS_LOCK:
                _AI_JOBS[job_id] = {
                    "status": "done",
                    "result": {
                        "forecast_narrative":    prediction.get("forecast_narrative"),
                        "key_factors":           prediction.get("key_factors"),
                        "public_health_actions": prediction.get("public_health_actions"),
                        "primary_driver":        prediction.get("primary_driver"),
                        "confidence":            prediction.get("confidence"),
                        "confidence_note":       prediction.get("confidence_note"),
                        "r_effective":           prediction.get("r_effective"),
                        "outbreak_probability":  prediction.get("outbreak_probability"),
                        "epidemic_risk_level":   prediction.get("epidemic_risk_level"),
                        "trajectory":            prediction.get("trajectory"),
                        "doubling_days":         prediction.get("doubling_days"),
                    }
                }
        else:
            with _AI_JOBS_LOCK:
                _AI_JOBS[job_id] = {"status": "error", "error": "Gemma unavailable"}

    threading.Thread(target=_run_outbreak_ai, daemon=True).start()

    return jsonify({
        **rule_prediction,
        "county":         county_info["county"],
        "state":          county_info["state"],
        "fips":           target_fips,
        "pop":            pop,
        "stats":          {
            "sick_7d":                  sick_7d,
            "total_7d":                 total_7d,
            "reporter_sick_pct":        round(reporter_sick_pct, 3),
            "trend_pct":                trend_pct,
            "reporting_rate_per_million": reporting_rate_per_million,
            "sufficient_data":          sufficient_data,
        },
        "travel_sources": len(travel_sources),
        "sir":            sir,
        "ai_job_id":      job_id,
        "ai_pending":     True,
    })


@app.route("/api/travel-flow/<target_fips>", methods=["GET"])
def travel_flow(target_fips):
    """
    Real airline route data from OpenFlights (openflights.org/data, ODbL licence)
    × US Census Bureau county centroids (CenPop2020, public domain).

    1,251 US airports · 5,450 domestic routes · 3,221 counties.

    For the hovered county we look up its nearest routed airport(s), find every
    direct inbound domestic route, map each source airport to its nearest county,
    then weight by sick-report count × route frequency.
    All airport→county and county→airport mappings are pre-computed at startup.
    """
    import sqlite3

    # Sick report counts per FIPS (past 7 days)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        SELECT fips, COUNT(*) as sick_count
        FROM reports
        WHERE feeling = 'sick'
          AND fips IS NOT NULL
          AND fips != ''
          AND fips != ?
          AND timestamp >= datetime('now', '-7 days')
        GROUP BY fips
    """, (target_fips,))
    sick_by_fips = {row[0]: row[1] for row in c.fetchall()}
    conn.close()

    return jsonify(get_inbound_sources(target_fips, sick_by_fips))


@app.route("/api/us-map", methods=["GET"])
def us_map():
    import sqlite3
    from database import DB_PATH
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Group rows that have a fips field directly (demo data)
    cursor.execute("""
        SELECT fips, county, feeling
        FROM reports
        WHERE fips IS NOT NULL AND fips != ''
    """)
    fips_rows = cursor.fetchall()

    # Also handle real user reports (fips null, look up via zip→county_data)
    cursor.execute("""
        SELECT zip_code, county, feeling
        FROM reports
        WHERE (fips IS NULL OR fips = '') AND zip_code IS NOT NULL
    """)
    zip_rows = cursor.fetchall()
    conn.close()

    # Build a FIPS-keyed map from county_data for metadata enrichment
    fips_meta = {v[5]: v for v in COUNTY_DATA.values()}  # fips → (name,state,lat,lon,pop,fips)

    result = {}

    def add(fips, county_label, feeling):
        if fips not in result:
            meta = fips_meta.get(fips)
            result[fips] = {
                "fips":    fips,
                "county":  meta[0] if meta else county_label,
                "state":   meta[1] if meta else "",
                "lat":     meta[2] if meta else None,
                "lon":     meta[3] if meta else None,
                "pop":     meta[4] if meta else 0,
                "total": 0, "sick": 0, "healthy": 0,
            }
        result[fips]["total"] += 1
        result[fips]["sick" if feeling == "sick" else "healthy"] += 1

    for fips, county, feeling in fips_rows:
        add(fips, county, feeling)

    for zip_code, county, feeling in zip_rows:
        meta = COUNTY_DATA.get(zip_code)
        if meta and meta[5]:
            add(meta[5], county, feeling)

    return jsonify(list(result.values()))


COUNTY_ANALYSIS_PROMPT = """You are an epidemiological prediction model for CommunityPulse, a national US One Health surveillance platform.

You receive FIVE independent data streams for a county. You MUST draw on all five in your analysis — never skip a dataset, even when self-reported case counts are low. External authoritative sources (CDC, Epicore, BEACON, weather) prevent the analysis from being biased toward counties with high participation rates.

=== DATA STREAMS ===
1. SELF-REPORTED SURVEILLANCE — Local participatory case counts, symptom patterns, severity indicators, and One Health exposure flags. Note: participation bias means underreporting is common; weight trends more than raw counts.

2. NEIGHBORING COUNTY SPREAD — Illness levels in surrounding counties and their trend direction. A rising cluster in an adjacent county is an advance warning even before local cases appear.

3. INBOUND TRAVEL RISK — Direct-flight illness signals from source counties. High traffic + active illness in the source = meaningful importation risk regardless of current local counts.

4. ENVIRONMENTAL & WEATHER — Current temperature, humidity, and conditions. Cold/dry air accelerates respiratory spread; flooding drives waterborne risk; heat stress suppresses immune response.

5. AUTHORITATIVE SURVEILLANCE — CDC FluView ILI rates (HHS Region 9), Epicore verified outbreak events, and BEACON biosurveillance signals. These represent ground truth independent of local reports.

=== YOUR TASK ===
Synthesize all five streams into a risk assessment. Your summary MUST:
- State what the authoritative data (CDC/Epicore/BEACON) shows baseline risk to be
- State whether neighboring county or travel data suggests geographic spread toward this county
- State what local self-reports add (or cannot add, if counts are low)
- State how weather conditions modulate any of the above

Rules:
- Call out small sample sizes explicitly. External data should anchor risk when local counts are sparse.
- Return ONLY a valid JSON object. No markdown fences, no text outside the JSON.

Return exactly:
{
  "risk_level": "low" | "medium" | "high" | "severe",
  "summary": "2-3 sentences that cite at least one authoritative source AND the community trend. Explain what is driving risk right now.",
  "trend_assessment": "Predicted 7-14 day trajectory. Name the specific evidence — neighboring spread, travel signal, weather shift, CDC trend — that drives the prediction.",
  "key_drivers": ["2-4 factors. Each must name the data source: e.g. 'CDC FluView elevated ILI', 'Maricopa County rising 42%', 'flooding waterborne risk', 'tick bite exposure reports'"],
  "recommendations": ["2-4 specific, actionable steps for residents. End with: Consult a healthcare provider if symptoms develop."],
  "travel_risk_note": "Name specific source counties contributing inbound risk. If none, state why travel risk is low.",
  "confidence": "low" | "medium" | "high",
  "confidence_note": "Explain sample size limitations AND which external data source is anchoring the assessment when local reports are sparse."
}"""


@app.route("/api/county-detail/<target_fips>", methods=["GET"])
def county_detail(target_fips):
    """
    Phase 1 (<1.5s): DB queries + weather (cached) + rule-based fallback returned immediately.
    Phase 2 (async): FluView fetch + Gemma analysis run in background. Frontend polls ai_job_id.
    """
    import sqlite3
    from collections import Counter

    county_info = ALL_COUNTIES.get(target_fips)
    if not county_info:
        return jsonify({"error": "County not found"}), 404

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT feeling, symptoms, age_group,
               recent_travel, event_attendance, animal_contact,
               sick_animals, water_concerns,
               household_members, sick_household_members
        FROM reports
        WHERE fips = ? AND timestamp >= datetime('now', '-7 days')
    """, (target_fips,))
    rows_7d = [dict(r) for r in c.fetchall()]

    c.execute("""
        SELECT COUNT(*) FROM reports
        WHERE fips = ?
          AND timestamp >= datetime('now', '-14 days')
          AND timestamp < datetime('now', '-7 days')
    """, (target_fips,))
    prior_count = c.fetchone()[0]

    c.execute("""
        SELECT date(timestamp) as day,
               SUM(CASE WHEN feeling='sick' THEN 1 ELSE 0 END) as sick,
               COUNT(*) as total
        FROM reports
        WHERE fips = ? AND timestamp >= datetime('now', '-7 days')
        GROUP BY day ORDER BY day
    """, (target_fips,))
    daily = [{"date": r[0], "sick": r[1], "total": r[2]} for r in c.fetchall()]

    c.execute("""
        SELECT fips, COUNT(*) FROM reports
        WHERE feeling = 'sick' AND fips IS NOT NULL AND fips != ''
          AND fips != ? AND timestamp >= datetime('now', '-7 days')
        GROUP BY fips
    """, (target_fips,))
    sick_by_fips = {row[0]: row[1] for row in c.fetchall()}
    conn.close()

    # ── Aggregate ─────────────────────────────────────────────────────────────
    sick_rows    = [r for r in rows_7d if r["feeling"] == "sick"]
    healthy_rows = [r for r in rows_7d if r["feeling"] == "healthy"]
    total        = len(rows_7d)
    sick_count   = len(sick_rows)
    sick_rate    = round(sick_count / total, 3) if total else 0

    if prior_count > 0:
        trend_pct = round((total - prior_count) / prior_count * 100, 1)
    elif total > 0:
        trend_pct = 100.0
    else:
        trend_pct = 0.0

    symptom_counter = Counter()
    for r in sick_rows:
        try:
            for s in json.loads(r["symptoms"] or "[]"):
                symptom_counter[s] += 1
        except Exception:
            pass
    symptoms_list = [
        {"name": s, "count": cnt, "pct": round(cnt / max(sick_count, 1), 3)}
        for s, cnt in symptom_counter.most_common(10)
    ]

    age_counter = Counter(r.get("age_group") or "unknown" for r in rows_7d)

    rf = {
        "recent_travel":          sum(1 for r in rows_7d if r.get("recent_travel")),
        "event_attendance":       sum(1 for r in rows_7d if r.get("event_attendance")),
        "tick_insect_bite":       sum(1 for r in rows_7d if r.get("tick_insect_bite")),
        "animal_bite":            sum(1 for r in rows_7d if r.get("animal_bite")),
        "animal_contact":         sum(1 for r in rows_7d if r.get("animal_contact")),
        "contact_sick_individual":sum(1 for r in rows_7d if r.get("contact_sick_individual")),
        "absent_from_work":       sum(1 for r in rows_7d if r.get("absent_from_work")),
        "absent_from_school":     sum(1 for r in rows_7d if r.get("absent_from_school")),
        "sought_healthcare":      sum(1 for r in rows_7d if r.get("sought_healthcare")),
        "water_concerns":         sum(1 for r in rows_7d if r.get("water_concerns")),
        "flooding":               sum(1 for r in rows_7d if r.get("flooding")),
        "reporting_to_authority": sum(1 for r in rows_7d if r.get("reporting_to_authority")),
    }

    travel = get_inbound_sources(target_fips, sick_by_fips)
    neighbor_spread = _get_county_spread_context(
        exclude_county=county_info["county"],
        lat=county_info["lat"],
        lon=county_info["lon"],
    )
    # Weather fetched synchronously (fast — cached after first hit per county)
    weather = _get_weather_cached(county_info["lat"], county_info["lon"])

    # Rule-based fallback AI analysis (shown immediately while Gemma runs in background)
    travel_source_count = len(travel.get("sources", []))
    rl_fallback = "severe" if sick_rate > 0.75 else ("high" if sick_rate > 0.5 else ("medium" if sick_rate > 0.25 else "low"))
    ai_fallback = {
        "risk_level": rl_fallback,
        "summary": (
            f"{county_info['county']} County: {total} self-reports in 7 days "
            f"({sick_rate*100:.0f}% sick rate, {trend_pct:+.0f}% trend). "
            f"AI analysis loading…"
        ),
        "trend_assessment": (
            f"Reports {'rising' if trend_pct > 0 else 'falling'} "
            f"({abs(trend_pct):.0f}% vs prior week). Full AI assessment in progress."
        ),
        "key_drivers": (
            [s["name"] for s in symptoms_list[:3]]
            + (["elevated neighboring county illness"] if "HIGH" in neighbor_spread else [])
            + (["inbound travel illness signal"] if travel_source_count > 0 else [])
        ) or ["Insufficient local data — see authoritative sources"],
        "recommendations": [
            "Check CDC FluView and local health department advisories.",
            "Wash hands frequently and avoid symptomatic individuals.",
            "Stay home if you feel unwell.",
            "Consult a healthcare provider if symptoms develop.",
        ],
        "travel_risk_note": (
            f"{travel_source_count} counties with direct flights are reporting active illness."
            if travel_source_count else "No significant inbound travel signals."
        ),
        "confidence": "low" if total < 10 else ("medium" if total < 50 else "high"),
        "confidence_note": f"Rule-based estimate from {total} self-reports. AI analysis loading.",
        "ai_pending": True,
    }

    # ── Async job: parallel weather+FluView fetch, then Gemma ─────────────────
    job_id = str(uuid.uuid4())
    with _AI_JOBS_LOCK:
        _AI_JOBS[job_id] = {"status": "pending", "result": None}

    _ci         = county_info
    _tf         = target_fips
    _total      = total
    _sick_count = sick_count
    _sick_rate  = sick_rate
    _trend_pct  = trend_pct
    _prior      = prior_count
    _healthy    = len(healthy_rows)
    _syms       = symptoms_list
    _rf         = rf
    _age        = dict(age_counter)
    _travel     = travel
    _ns         = neighbor_spread
    _weather    = weather  # already fetched synchronously

    def _run_county_detail_ai():
        # FluView only — weather is already in the sync response (cached)
        fluview = _get_fluview_cached(_ci["state"])
        weather = _weather

        epicore = ""
        beacon  = ""
        baseline = HEALTH_BASELINE.get(_ci["county"], HEALTH_BASELINE["default"])

        top_symptoms = "\n".join(
            f"  - {s['name']}: {s['count']} reports ({s['pct']*100:.0f}% of sick)"
            for s in _syms[:7]
        ) or "  No symptoms recorded"

        top_sources = "\n".join(
            f"  - {s['county']}, {s['state']}: {s['sick']} sick travellers, inbound weight {s['weight']}"
            for s in _travel.get("sources", [])[:6]
        ) or "  No significant inbound travel illness signals"

        weather_str = (
            f"{weather.get('temp','N/A')}°F, feels like {weather.get('feels_like','N/A')}°F, "
            f"{weather.get('conditions','unavailable')}, {weather.get('humidity','?')}% humidity"
        )

        ai_prompt = f"""=== STREAM 1: SELF-REPORTED SURVEILLANCE — {_ci['county'].upper()} COUNTY, {_ci['state']} ===
Population: {_ci['pop']:,}
7-day window: {_total} total reports | {_sick_count} sick ({_sick_rate*100:.1f}% sick rate) | {_healthy} healthy
Week-over-week: {_trend_pct:+.1f}% (prior 7 days: {_prior} reports)

Top symptoms (sick reporters):
{top_symptoms}

One Health risk factors:
  Exposure:    recent_travel={_rf['recent_travel']}, mass_event={_rf['event_attendance']}, tick/insect_bite={_rf['tick_insect_bite']}, animal_bite={_rf['animal_bite']}, animal_contact={_rf['animal_contact']}, contact_confirmed_case={_rf['contact_sick_individual']}
  Severity:    absent_work={_rf['absent_from_work']}, absent_school={_rf['absent_from_school']}, sought_healthcare={_rf['sought_healthcare']}, reported_authority={_rf['reporting_to_authority']}
  Environment: water_concerns={_rf['water_concerns']}, flooding={_rf['flooding']}
Age distribution: {_age}
County baseline context: {baseline.get('notes', 'none')}

=== STREAM 2: NEIGHBORING COUNTY SPREAD ===
{_ns}

=== STREAM 3: INBOUND TRAVEL ILLNESS RISK (direct flights × active illness) ===
{top_sources}

=== STREAM 4: ENVIRONMENTAL & WEATHER ===
Current: {weather_str}

=== STREAM 5: AUTHORITATIVE SURVEILLANCE ===
{fluview}
{epicore}
{beacon}"""

        ai_analysis = _call_openai_json(COUNTY_ANALYSIS_PROMPT, ai_prompt)

        if not ai_analysis:
            _src_count = len(_travel.get("sources", []))
            ai_analysis = {
                "risk_level": _sick_rate > 0.75 and "severe" or (_sick_rate > 0.5 and "high" or (_sick_rate > 0.25 and "medium" or "low")),
                "summary": (
                    f"{_ci['county']} County has {_total} self-reports over the past 7 days "
                    f"({_sick_rate*100:.0f}% sick rate, {_trend_pct:+.0f}% week-over-week). "
                    f"{fluview}."
                ),
                "trend_assessment": (
                    f"Local reports are {'rising' if _trend_pct > 0 else 'falling'} "
                    f"({abs(_trend_pct):.0f}% vs prior week). "
                    f"Neighboring spread: {_ns[:120]}. Monitor over 7-14 days."
                ),
                "key_drivers": (
                    [s["name"] for s in _syms[:3]]
                    + (["elevated neighboring county illness"] if "HIGH" in _ns else [])
                    + (["inbound travel illness signal"] if _src_count > 0 else [])
                ) or ["Insufficient local data — see authoritative sources above"],
                "recommendations": [
                    "Check CDC FluView and local health department advisories.",
                    "Wash hands frequently and avoid symptomatic individuals.",
                    "Stay home if you feel unwell.",
                    "Consult a healthcare provider if symptoms develop or worsen.",
                ],
                "travel_risk_note": (
                    f"{_src_count} counties with direct flight connections are reporting active illness."
                    if _src_count else "No significant inbound travel illness signals detected."
                ),
                "confidence": "low" if _total < 10 else ("medium" if _total < 50 else "high"),
                "confidence_note": (
                    f"Based on {_total} self-reported cases. Gemma unavailable — rule-based fallback."
                ),
            }

        with _AI_JOBS_LOCK:
            _AI_JOBS[job_id] = {
                "status": "done",
                "result": {
                    "ai_analysis": ai_analysis,
                    "weather": weather,
                    "fluview": fluview,
                }
            }

    threading.Thread(target=_run_county_detail_ai, daemon=True).start()

    return jsonify({
        "county":          county_info,
        "stats": {
            "total":      total,
            "sick":       sick_count,
            "healthy":    len(healthy_rows),
            "sick_rate":  sick_rate,
            "trend_pct":  trend_pct,
            "prior_week": prior_count,
            "daily":      daily,
        },
        "symptoms":        symptoms_list,
        "age_groups":      dict(age_counter),
        "risk_factors":    rf,
        "travel":          travel,
        "weather":         weather,   # available immediately (cached)
        "fluview":         "",        # filled in when ai_job completes
        "epicore":         "",
        "beacon":          "",
        "neighbor_spread": neighbor_spread,
        "ai_analysis":     ai_fallback,
        "ai_job_id":       job_id,
        "ai_pending":      True,
    })


@app.route("/api/demo/seed", methods=["POST"])
def demo_seed():
    count = seed_demo_data()
    return jsonify({"seeded": count, "demo_active": True, "scenario": "national_baseline"})


@app.route("/api/demo/seed-new-england", methods=["POST"])
def demo_seed_new_england():
    count = seed_new_england_outbreak()
    return jsonify({"seeded": count, "demo_active": True, "scenario": "new_england_outbreak"})


@app.route("/api/demo/clear", methods=["POST"])
def demo_clear():
    count = clear_demo_data()
    return jsonify({"cleared": count, "demo_active": False})


@app.route("/api/demo/status", methods=["GET"])
def demo_status():
    count = get_demo_status()
    return jsonify({"demo_rows": count, "demo_active": count > 0})


@app.route("/static/audio/<path:filename>")
def serve_audio(filename):
    return send_from_directory("static/audio", filename)


# ── GEMMA 4 Prediction Endpoints (requires Ollama running) ─────────────────────


@app.route("/api/gemma/status", methods=["GET"])
def gemma_status():
    """Check if Gemma model is available via Ollama."""
    if not GEMMA_AVAILABLE:
        return jsonify({
            "available": False,
            "backend": None,
            "message": "No Gemma backend available. Run: ollama serve && ollama pull gemma4:e2b"
        }), 503

    return jsonify({
        "available": True,
        "backend": "ollama",
        "model": gemma.ollama_model if gemma else "gemma4:e2b",
        "endpoint": "localhost:11434",
        "type": "local",
        "cost": "free",
        "offline": True,
        "message": "Gemma 4 ready via OLLAMA"
    })


@app.route("/api/predict/risk", methods=["POST"])
def predict_individual_risk():
    """
    Gemma: Predict individual risk score based on check-in data.
    Independent of user authentication (for demo).
    """
    if not GEMMA_AVAILABLE:
        return jsonify({
            "error": "Gemma model unavailable",
            "fallback": "Using rule-based assessment"
        }), 503

    try:
        gemma = get_gemma()
        data = request.get_json() or {}

        zip_code = data.get("zip_code", "85721")
        county = zip_to_county(zip_code)
        symptoms = data.get("symptoms", [])
        feeling = data.get("feeling", "healthy")
        household_sick = int(data.get("sick_household_members", 0))

        # Get supporting data
        cluster = detect_cluster(county)
        weather = get_weather(zip_code)

        # Call Gemma
        result = gemma.predict_individual_risk(
            symptoms=symptoms,
            feeling=feeling,
            household_sick=household_sick,
            county=county,
            weather_data=weather,
            county_trend=cluster,
        )

        return jsonify({
            "risk_assessment": result,
            "data_sources": ["symptoms", "weather", "county_trend"],
            "model": "gemma:4b"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/predict/county-forecast", methods=["GET"])
def predict_county_forecast():
    """
    Gemma: Forecast county-level outbreak trend (7-14 days).
    """
    if not GEMMA_AVAILABLE:
        return jsonify({
            "error": "Gemma model unavailable",
            "fallback": True
        }), 503

    try:
        gemma = get_gemma()
        county = request.args.get("county", "Pima")

        cluster = detect_cluster(county, window_days=3)
        travel = get_inbound_sources(county, {})

        result = gemma.predict_county_outbreak(
            county=county,
            recent_reports=cluster.get("report_count", 0),
            trend_pct=cluster.get("trend_pct", 0),
            chart_data=cluster.get("chart_data", []),
            travel_inbound=[f"{s['county']}, {s['state']}" for s in travel.get("sources", [])[:5]],
        )

        return jsonify({
            "county": county,
            "forecast": result,
            "model": "gemma:4b"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/predict/recommendations", methods=["GET"])
@optional_auth
def predict_recommendations(current_user):
    """
    Gemma: Generate personalized wellness recommendations.
    Requires authentication to fetch user history.
    """
    if not GEMMA_AVAILABLE:
        return jsonify({
            "error": "Gemma model unavailable",
            "suggestions": [
                {"action": "Monitor your symptoms daily", "priority": "high"},
                {"action": "Stay informed on local outbreak status", "priority": "medium"}
            ]
        }), 503

    if not current_user:
        return jsonify({"error": "Authentication required"}), 401

    try:
        gemma = get_gemma()
        user_id = current_user["id"]

        # Fetch user stats (including county)
        user_stats = get_user_stats(user_id)
        county = user_stats.get("county", "Pima")

        # Get county trend
        cluster = detect_cluster(county)

        # Fetch recent symptom history from DB (last 7 days)
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            SELECT symptoms, timestamp FROM reports
            WHERE user_id = ? AND timestamp >= datetime('now', '-7 days')
            ORDER BY timestamp DESC LIMIT 10
        """, (user_id,))
        hist = [{"symptoms": json.loads(r[0] or "[]"), "date": r[1]} for r in c.fetchall()]
        conn.close()

        # Calculate risk score from stats
        risk_score = min(100, int(user_stats.get("sick_streak", 0) * 10))

        result = gemma.personalized_recommendations(
            user_profile={
                "age_group": current_user.get("age_group", "unknown"),
                "conditions": current_user.get("conditions", []),
            },
            symptom_history=hist,
            risk_score=risk_score,
            county_trend=cluster,
        )

        return jsonify({
            "user_id": user_id,
            "recommendations": result,
            "model": "gemma:4b"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/predict/patterns", methods=["GET"])
def predict_patterns():
    """
    Gemma: Analyze historical patterns in a county's surveillance data.
    Identifies high-risk profiles and seasonal trends.
    """
    if not GEMMA_AVAILABLE:
        return jsonify({"error": "Gemma model unavailable"}), 503

    try:
        gemma = get_gemma()
        county = request.args.get("county", "Pima")
        days = int(request.args.get("days", 30))

        # Fetch historical data for county
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        fips = next((v[5] for k, v in COUNTY_DATA.items() if v[0] == county), None)

        if not fips:
            return jsonify({"error": f"County not found: {county}"}), 404

        c.execute(f"""
            SELECT symptoms, feeling, timestamp FROM reports
            WHERE fips = ? AND timestamp >= datetime('now', '-{days} days')
            ORDER BY timestamp DESC LIMIT 100
        """, (fips,))

        reports = []
        for r in c.fetchall():
            try:
                reports.append({
                    "symptoms": json.loads(r[0] or "[]"),
                    "feeling": r[1],
                    "date": r[2]
                })
            except:
                pass

        conn.close()

        if not reports:
            return jsonify({
                "county": county,
                "patterns": ["Insufficient data"],
                "insights": "Need more surveillance data to identify patterns."
            })

        result = gemma.analyze_patterns(reports, county)

        return jsonify({
            "county": county,
            "analysis_period_days": days,
            "reports_analyzed": len(reports),
            "patterns": result,
            "model": "gemma:4b"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    app.run(debug=True, port=5001)

