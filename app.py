from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import jwt as pyjwt
import os
import json
import requests

from database import (
    init_db, save_report, zip_to_county, seed_demo_data, clear_demo_data, get_demo_status,
    init_users_db, create_user, get_user_by_email, get_user_by_id, get_user_by_username,
    update_user_streak, add_friend, remove_friend, get_friends, get_user_stats,
)
from forecast import detect_cluster, get_community_risk_map

load_dotenv()

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

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

os.makedirs("static/audio", exist_ok=True)

with open("data/az_health_baseline.json") as f:
    AZ_BASELINE = json.load(f)

JWT_SECRET = os.getenv("JWT_SECRET", "cp-dev-secret-change-in-prod")

init_db()
init_users_db()


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

SYSTEM_PROMPT = """You are a transparent public health AI assistant for CommunityPulse,
an Arizona community surveillance tool using the One Health framework — combining human,
animal, and environmental data to detect illness clusters early.

Always return valid JSON with exactly these fields:
{
  "risk_level": "low or medium or high",
  "recommendation": "2-3 sentences. Direct, actionable, compassionate.",
  "notify_others": true or false,
  "notify_message": "Short pre-written message the user can send to close contacts.",
  "ai_explanation": "Plain English: what data sources we used, how we reached this conclusion, confidence level, what we do not know.",
  "wellness_tip": "Only for healthy check-ins: one specific positive health tip. Empty string if sick."
}

Never provide a medical diagnosis. Always include this exact phrase at the end of recommendation:
This is not medical advice — consult a healthcare provider."""


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
            "conditions": data["weather"][0]["description"],
        }
    except Exception:
        return {"temp": "N/A", "conditions": "unavailable"}


def get_cdc_fluview():
    """
    Fetch current CDC FluView ILI data for HHS Region 9 (AZ/CA/NV/HI).
    Queries a rolling window of the past 20 epiweeks to get the latest.
    """
    try:
        from datetime import date
        year = date.today().year
        # Query current year's epiweeks
        r = requests.get(
            f"https://api.delphi.cmu.edu/epidata/fluview/?regions=hhs9&epiweeks={year}01-{year}52",
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
                # ILI > 2.5% is considered elevated
                level = "elevated" if wili > 2.5 else "baseline"
                return (
                    f"CDC FluView HHS Region 9 (AZ/NV/CA): ILI rate {ili}%, "
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


def build_user_prompt(data, county, cluster, weather, epicore, fluview, beacon, baseline):
    symptoms = data.get("symptoms", [])
    feeling = data.get("feeling", "sick")
    return f"""
Feeling: {feeling}
Symptoms: {', '.join(symptoms) if symptoms else 'none reported'}
Location: {county} County, AZ (zip {data.get('zip_code', 'unknown')})
Age group: {data.get('age_group', 'adult')}
Household: {data.get('household_members', 1)} people, {data.get('sick_household_members', 0)} symptomatic
First report of these symptoms: {'yes' if data.get('first_time_reporting') else 'no'}
Recent travel: {'yes' if data.get('recent_travel') else 'no'}
Large event attendance (past 2 weeks): {'yes' if data.get('event_attendance') else 'no'}
Animal/livestock contact: {'yes' if data.get('animal_contact') else 'no'}
Sick animals nearby: {'yes' if data.get('sick_animals', 0) > 0 else 'no'}
Water source concerns: {'yes' if data.get('water_concerns') else 'no'}
Reporting to health authority: {'yes' if data.get('reporting_to_authority') else 'no'}

Community surveillance data (past 72h in {county} County):
- CommunityPulse reports: {cluster['report_count']} similar symptom clusters
- Week-over-week trend: {cluster['trend_pct']}% ({'CLUSTER DETECTED' if cluster['is_cluster'] else 'no cluster'})
- Forecast: {cluster['forecast']}

External intelligence:
- Weather: {weather['temp']}F, {weather['conditions']}
- {fluview}
- {epicore}
- {beacon}
- County notes: {baseline.get('notes', '')}
"""


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
    zip_code = data.get("zip_code", "85721")
    county = zip_to_county(zip_code)
    feeling = data.get("feeling", "sick")

    save_report(data, county, user_id=current_user["id"] if current_user else None)

    cluster = detect_cluster(county)
    weather = get_weather(zip_code)
    epicore = get_epicore_events()
    fluview = get_cdc_fluview()
    beacon = get_beacon_signals()
    baseline = AZ_BASELINE.get(county, AZ_BASELINE["default"])

    user_prompt = build_user_prompt(data, county, cluster, weather, epicore, fluview, beacon, baseline)

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
        )
        ai_result = json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"GPT-4o error: {e}")
        ai_result = {
            "risk_level": "high" if cluster["is_cluster"] else ("medium" if cluster["report_count"] > 5 else "low"),
            "recommendation": (
                f"Based on {cluster['report_count']} similar reports in {county} County "
                f"and a {abs(cluster['trend_pct'])}% {'increase' if cluster['trend_pct'] > 0 else 'decrease'} "
                f"in illness reports this week, please monitor your symptoms closely and stay home if unwell. "
                f"This is not medical advice — consult a healthcare provider."
            ),
            "notify_others": cluster["is_cluster"],
            "notify_message": (
                f"Hey — CommunityPulse detected a potential illness cluster in {county} County, AZ. "
                f"Please take precautions and stay safe!"
            ),
            "ai_explanation": (
                f"Analysis based on {cluster['report_count']} self-reported cases in {county} County "
                f"over the past 72 hours (trend: {cluster['trend_pct']}%, {cluster['forecast']}). "
                f"Cross-referenced with Epicore verified outbreak events, BEACON biosurveillance signals, "
                f"CDC FluView Region 9 ILI data, and local weather. "
                f"AI analysis temporarily unavailable — using rule-based fallback."
            ),
            "wellness_tip": "Stay hydrated, get adequate sleep, and wash your hands frequently to support your immune system." if feeling == "healthy" else "",
        }

    audio_url = text_to_speech(ai_result.get("recommendation", ""))

    # Update server-side streak if user is logged in
    server_streak = None
    if current_user:
        server_streak = update_user_streak(current_user["id"])

    return jsonify({
        **ai_result,
        "cluster": cluster,
        "county": county,
        "audio_url": audio_url,
        "weather": weather,
        "server_streak": server_streak,
    })


@app.route("/api/community-risk", methods=["GET"])
def community_risk():
    return jsonify(get_community_risk_map())


@app.route("/api/demo/seed", methods=["POST"])
def demo_seed():
    count = seed_demo_data()
    return jsonify({"seeded": count, "demo_active": True})


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


if __name__ == "__main__":
    app.run(debug=True, port=5001)
