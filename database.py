import sqlite3
import json
import os
import random
import math
from datetime import datetime, timedelta
from county_data import COUNTY_DATA
from us_counties_seed import US_COUNTIES, STATE_SICK_RATES, sick_rate, daily_count

DB_PATH = os.path.join(os.path.dirname(__file__), 'reports.db')

ZIP_TO_COUNTY = {
    "850": "Maricopa", "851": "Maricopa", "852": "Maricopa", "853": "Maricopa",
    "854": "Yavapai",
    "855": "Pima", "856": "Cochise", "857": "Pima", "858": "Pima",
    "859": "Navajo",
    "860": "Coconino", "861": "Coconino", "862": "Coconino",
    "863": "Yavapai",
    "864": "Mohave", "865": "Mohave",
    "866": "Navajo", "867": "Navajo",
    "853": "Pinal",
}

AZ_COUNTIES = [
    "Maricopa", "Pima", "Pinal", "Cochise", "Yavapai",
    "Mohave", "Coconino", "Navajo", "Apache", "Graham",
    "Santa Cruz", "Greenlee", "La Paz"
]

def zip_to_county(zip_code):
    prefix = str(zip_code)[:3]
    return ZIP_TO_COUNTY.get(prefix, "Maricopa")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            zip_code TEXT,
            county TEXT,
            feeling TEXT,
            symptoms TEXT,
            age_group TEXT,
            household_members INTEGER DEFAULT 1,
            sick_household_members INTEGER DEFAULT 0,
            first_time_reporting INTEGER DEFAULT 1,
            recent_travel INTEGER DEFAULT 0,
            event_attendance INTEGER DEFAULT 0,
            animal_contact INTEGER DEFAULT 0,
            sick_animals INTEGER DEFAULT 0,
            water_concerns INTEGER DEFAULT 0,
            reporting_to_authority INTEGER DEFAULT 0,
            is_demo INTEGER DEFAULT 0
        )
    ''')
    for migration in [
        'ALTER TABLE reports ADD COLUMN is_demo INTEGER DEFAULT 0',
        'ALTER TABLE reports ADD COLUMN user_id INTEGER',
        'ALTER TABLE reports ADD COLUMN fips TEXT',
    ]:
        try:
            c.execute(migration)
            conn.commit()
        except Exception:
            pass
    conn.commit()
    conn.close()

def save_report(data, county, user_id=None):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO reports (zip_code, county, feeling, symptoms, age_group,
            household_members, sick_household_members, first_time_reporting,
            recent_travel, event_attendance, animal_contact, sick_animals,
            water_concerns, reporting_to_authority, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('zip_code', ''),
        county,
        data.get('feeling', 'sick'),
        json.dumps(data.get('symptoms', [])),
        data.get('age_group', 'adult'),
        data.get('household_members', 1),
        data.get('sick_household_members', 0),
        1 if data.get('first_time_reporting') else 0,
        1 if data.get('recent_travel') else 0,
        1 if data.get('event_attendance') else 0,
        1 if data.get('animal_contact') else 0,
        data.get('sick_animals', 0),
        1 if data.get('water_concerns') else 0,
        1 if data.get('reporting_to_authority') else 0,
        user_id,
    ))
    conn.commit()
    conn.close()

def get_reports_by_county(county, days=14):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT DATE(timestamp) as date, COUNT(*) as count
        FROM reports
        WHERE county = ?
        AND feeling = 'sick'
        AND timestamp >= datetime('now', ?)
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
    ''', (county, f'-{days} days'))
    rows = c.fetchall()
    conn.close()
    return rows

def _make_sick_pattern(pop):
    """Generate a 7-day growing sick count proportional to county population."""
    peak = max(1, round(pop / 600000))
    # Ramp up over 7 days: start ~40% of peak, end at peak
    return [max(0, round(peak * f)) for f in [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]]


def _make_healthy_pattern(pop):
    """Generate a 7-day stable healthy count proportional to county population."""
    daily = max(1, round(pop / 400000))
    return [daily] * 7


# Counties designated as "healthy-majority" for demo variety (zip codes)
_HEALTHY_ZIPS = {
    "98101",  # King, WA (Seattle)
    "80202",  # Denver, CO
    "02101",  # Middlesex, MA (Boston area)
    "97201",  # Multnomah, OR (Portland)
    "55401",  # Hennepin, MN (Minneapolis)
    "27601",  # Wake, NC (Raleigh)
    "80901",  # El Paso, CO (Colorado Springs)
    "23451",  # Virginia Beach, VA
    "05401",  # Chittenden, VT
    "96813",  # Honolulu, HI
    "83702",  # Ada, ID (Boise)
    "58102",  # Cass, ND (Fargo)
    "57101",  # Minnehaha, SD (Sioux Falls)
    "82001",  # Laramie, WY (Cheyenne)
    "25301",  # Kanawha, WV (Charleston)
}


def seed_demo_data():
    """
    Seed ~500 US counties with realistic population-proportional, regionally-tuned
    sick/healthy reports over the past 7 days.  All rows have is_demo=1.

    Regional sick rates (STATE_SICK_RATES) reflect a late-April scenario:
      Southeast: active spring flu wave (0.62-0.70)
      Northeast/Midwest: moderate urban spread (0.48-0.62)
      Mountain West / Pacific NW: low (0.24-0.32)

    Temporal shape:
      Outbreak states (rate > 0.55): growing curve over 7 days
      Stable states:                 flat with ±10% daily noise
    """
    symptom_pools = [
        ["fever", "cough"],
        ["fever", "fatigue", "headache"],
        ["cough", "sore_throat"],
        ["fever", "cough", "difficulty_breathing"],
        ["fatigue", "headache"],
        ["nausea", "fatigue"],
        ["fever", "loss_of_smell_taste", "fatigue"],
        ["body_aches", "chills"],
        ["runny_nose", "sore_throat", "fatigue"],
    ]
    age_groups = ["adult"] * 6 + ["elderly"] * 3 + ["child"] * 1

    # Outbreak growth multipliers (day -6 → day 0)
    GROWTH_CURVE   = [0.55, 0.65, 0.73, 0.82, 0.90, 0.96, 1.00]
    STABLE_CURVE   = [0.90, 1.05, 0.95, 1.00, 1.10, 0.95, 1.00]
    DECLINING_CURVE= [1.00, 0.96, 0.90, 0.82, 0.73, 0.65, 0.55]

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = datetime.now().date()
    inserted = 0

    for (fips, county_name, state, pop) in US_COUNTIES:
        sr = sick_rate(state)             # per-county rate with regional noise
        base = daily_count(pop)           # base daily reports (sick + healthy)

        outbreak = sr > 0.55
        declining = sr < 0.32             # mountain west / PNW declining trend
        curve = GROWTH_CURVE if outbreak else (DECLINING_CURVE if declining else STABLE_CURVE)

        for day_offset, multiplier in enumerate(curve):
            day = today - timedelta(days=(6 - day_offset))
            # Natural day-of-week effect: weekends ~20% fewer reports
            dow_factor = 0.82 if day.weekday() >= 5 else 1.0
            total_today = max(1, round(base * multiplier * dow_factor))

            sick_today    = max(0, round(total_today * sr))
            healthy_today = max(0, total_today - sick_today)

            for feeling, count in [("sick", sick_today), ("healthy", healthy_today)]:
                for _ in range(count):
                    hour   = random.randint(6, 22)
                    minute = random.randint(0, 59)
                    ts = datetime.combine(day, datetime.min.time()).replace(
                        hour=hour, minute=minute
                    )
                    symptoms = random.choice(symptom_pools) if feeling == "sick" else []
                    age  = random.choice(age_groups)
                    hh   = random.randint(1, 4)
                    sick_hh = random.randint(0, min(hh - 1, 2)) if feeling == "sick" else 0
                    c.execute('''
                        INSERT INTO reports (
                            timestamp, zip_code, county, feeling, symptoms, age_group,
                            household_members, sick_household_members,
                            first_time_reporting, recent_travel, event_attendance,
                            animal_contact, sick_animals, water_concerns,
                            reporting_to_authority, is_demo, fips
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    ''', (
                        ts.isoformat(),
                        fips,           # use fips as zip placeholder for demo rows
                        county_name,
                        feeling,
                        json.dumps(symptoms), age,
                        hh, sick_hh,
                        random.randint(0, 1),
                        1 if (outbreak and random.random() < 0.3) else 0,
                        random.randint(0, 1),
                        random.randint(0, 1),
                        0,
                        random.randint(0, 1),
                        random.randint(0, 1),
                        fips,
                    ))
                    inserted += 1

    conn.commit()
    conn.close()
    return inserted


def clear_demo_data():
    """Remove all rows flagged as demo data."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('DELETE FROM reports WHERE is_demo = 1')
    deleted = c.rowcount
    conn.commit()
    conn.close()
    return deleted


def init_users_db():
    """Create users and friendships tables."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            streak INTEGER DEFAULT 0,
            best_streak INTEGER DEFAULT 0,
            last_checkin DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    try:
        c.execute('ALTER TABLE users ADD COLUMN best_streak INTEGER DEFAULT 0')
        conn.commit()
    except Exception:
        pass
    c.execute('''
        CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            friend_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (friend_id) REFERENCES users(id),
            UNIQUE(user_id, friend_id)
        )
    ''')
    conn.commit()
    conn.close()


def create_user(username, email, password_hash):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
        (username, email, password_hash)
    )
    user_id = c.lastrowid
    conn.commit()
    conn.close()
    return user_id


def get_user_by_email(email):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE email = ?', (email,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_username(username):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE username = ?', (username,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def update_user_streak(user_id):
    """Calculate and persist the streak for a user based on today's check-in."""
    from datetime import date
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT streak, last_checkin FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return 0

    streak, last_checkin = row
    if last_checkin == today:
        conn.close()
        return streak  # Already checked in today
    elif last_checkin == yesterday:
        streak += 1
    else:
        streak = 1

    c.execute('SELECT best_streak FROM users WHERE id = ?', (user_id,))
    best_row = c.fetchone()
    best = best_row[0] if best_row else 0
    new_best = max(streak, best)

    c.execute(
        'UPDATE users SET streak = ?, best_streak = ?, last_checkin = ? WHERE id = ?',
        (streak, new_best, today, user_id)
    )
    conn.commit()
    conn.close()
    return streak


def add_friend(user_id, friend_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        # Insert both directions so queries only need one direction
        c.execute(
            'INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)',
            (user_id, friend_id)
        )
        c.execute(
            'INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)',
            (friend_id, user_id)
        )
        conn.commit()
        conn.close()
        return True
    except Exception:
        conn.close()
        return False


def remove_friend(user_id, friend_id):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
        (user_id, friend_id, friend_id, user_id)
    )
    conn.commit()
    conn.close()


def get_friends(user_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('''
        SELECT u.id, u.username, u.streak, u.last_checkin
        FROM users u
        JOIN friendships f ON f.friend_id = u.id
        WHERE f.user_id = ?
        ORDER BY u.streak DESC, u.username ASC
    ''', (user_id,))
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_user_stats(user_id):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Core user fields
    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = dict(c.fetchone() or {})

    # Total check-ins
    c.execute('SELECT COUNT(*) FROM reports WHERE user_id = ? AND is_demo = 0', (user_id,))
    user['total_checkins'] = c.fetchone()[0]

    # Sick vs healthy split
    c.execute(
        'SELECT feeling, COUNT(*) FROM reports WHERE user_id = ? AND is_demo = 0 GROUP BY feeling',
        (user_id,)
    )
    counts = {row[0]: row[1] for row in c.fetchall()}
    user['sick_checkins'] = counts.get('sick', 0)
    user['healthy_checkins'] = counts.get('healthy', 0)

    # Most reported county
    c.execute('''
        SELECT county, COUNT(*) as n FROM reports
        WHERE user_id = ? AND is_demo = 0
        GROUP BY county ORDER BY n DESC LIMIT 1
    ''', (user_id,))
    row = c.fetchone()
    user['home_county'] = row[0] if row else None

    # Friend count
    c.execute('SELECT COUNT(*) FROM friendships WHERE user_id = ?', (user_id,))
    user['friend_count'] = c.fetchone()[0]

    # Leaderboard rank among friends (including self)
    c.execute('''
        SELECT COUNT(*) + 1 FROM users u
        JOIN friendships f ON f.friend_id = u.id
        WHERE f.user_id = ? AND u.streak > (SELECT streak FROM users WHERE id = ?)
    ''', (user_id, user_id))
    user['leaderboard_rank'] = c.fetchone()[0]

    conn.close()
    user.pop('password_hash', None)
    return user


def get_demo_status():
    """Return count of demo rows currently in the DB."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM reports WHERE is_demo = 1')
    count = c.fetchone()[0]
    conn.close()
    return count


def get_all_county_counts(days=3):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT county, COUNT(*) as count
        FROM reports
        WHERE feeling = 'sick'
        AND timestamp >= datetime('now', ?)
        GROUP BY county
    ''', (f'-{days} days',))
    rows = c.fetchall()
    conn.close()
    return {row[0]: row[1] for row in rows}
