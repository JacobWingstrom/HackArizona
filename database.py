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
    return ZIP_TO_COUNTY.get(prefix, "Unknown")

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
        'ALTER TABLE reports ADD COLUMN sex TEXT',
        'ALTER TABLE reports ADD COLUMN tick_insect_bite INTEGER DEFAULT 0',
        'ALTER TABLE reports ADD COLUMN animal_bite INTEGER DEFAULT 0',
        'ALTER TABLE reports ADD COLUMN contact_sick_individual INTEGER DEFAULT 0',
        'ALTER TABLE reports ADD COLUMN absent_from_work INTEGER DEFAULT 0',
        'ALTER TABLE reports ADD COLUMN absent_from_school INTEGER DEFAULT 0',
        'ALTER TABLE reports ADD COLUMN sought_healthcare INTEGER DEFAULT 0',
        'ALTER TABLE reports ADD COLUMN flooding INTEGER DEFAULT 0',
    ]:
        try:
            c.execute(migration)
            conn.commit()
        except Exception:
            pass
    conn.commit()
    conn.close()

def save_report(data, county, user_id=None, fips=None):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO reports (zip_code, county, fips, feeling, symptoms, age_group,
            household_members, sick_household_members, first_time_reporting,
            recent_travel, event_attendance, animal_contact, sick_animals,
            water_concerns, reporting_to_authority, user_id,
            sex, tick_insect_bite, animal_bite, contact_sick_individual,
            absent_from_work, absent_from_school, sought_healthcare, flooding)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('zip_code', ''),
        county,
        fips or data.get('fips', '') or None,
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
        data.get('sex') or None,
        1 if data.get('tick_insect_bite') else 0,
        1 if data.get('animal_bite') else 0,
        1 if data.get('contact_sick_individual') else 0,
        1 if data.get('absent_from_work') else 0,
        1 if data.get('absent_from_school') else 0,
        1 if data.get('sought_healthcare') else 0,
        1 if data.get('flooding') else 0,
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

    # Outbreak growth multipliers (index 0 = 29 days ago, index 29 = today)
    GROWTH_CURVE = [
        0.20, 0.22, 0.25, 0.28, 0.30,
        0.35, 0.38, 0.42, 0.46, 0.50,
        0.55, 0.60, 0.65, 0.68,
        0.72, 0.75, 0.80, 0.84, 0.87, 0.90,
        0.91, 0.93, 0.95, 0.96, 0.97, 0.98, 0.99, 1.00, 1.00, 1.00,
    ]
    STABLE_CURVE = [
        0.95, 1.05, 0.98, 1.02, 0.97,
        1.00, 0.96, 1.04, 0.99, 1.01,
        0.98, 1.03, 0.97, 1.00, 1.02,
        0.96, 1.05, 0.99, 1.01, 0.98,
        1.00, 0.97, 1.03, 0.99, 1.02,
        0.98, 1.00, 0.99, 1.01, 1.00,
    ]
    DECLINING_CURVE = [
        1.00, 1.00, 0.99, 0.98, 0.97,
        0.96, 0.94, 0.92, 0.90, 0.88,
        0.85, 0.82, 0.79, 0.76, 0.73,
        0.70, 0.67, 0.64, 0.61, 0.58,
        0.55, 0.52, 0.49, 0.46, 0.44,
        0.42, 0.40, 0.38, 0.36, 0.35,
    ]

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
            day = today - timedelta(days=(29 - day_offset))
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


def seed_new_england_outbreak():
    """
    Seed a realistic epidemic outbreak scenario centered in New England.

    Scenario: A novel respiratory illness emerges in Suffolk County (Boston) ~4 weeks ago,
    spreads to neighboring MA counties, then propagates to CT, RI, NH, ME, VT.

    Epicentre (Suffolk/Middlesex MA): explosive growth curve, high sick rate, travel flags.
    Inner ring (Essex, Norfolk, Plymouth MA + Providence RI + Hartford CT): rapid growth.
    Outer ring (rest of NE): moderate growth arriving later.
    Background: rest of US at low baseline so the NE cluster stands out on the map.
    """
    # (fips, county, state, pop, outbreak_tier, curve_start_day)
    # tier 0 = epicentre, tier 1 = inner ring, tier 2 = outer ring, tier 3 = background NE
    NE_COUNTIES = [
        # Suffolk MA (Boston) — epicentre
        ("25025", "Suffolk",    "MA", 797936,  0, 0),
        # Middlesex MA — day 3 spread
        ("25017", "Middlesex",  "MA", 1632002, 0, 3),
        # Inner ring MA
        ("25009", "Essex",      "MA", 809829,  1, 5),
        ("25021", "Norfolk",    "MA", 725981,  1, 5),
        ("25023", "Plymouth",   "MA", 530819,  1, 7),
        ("25005", "Bristol",    "MA", 579200,  1, 8),
        # Worcester MA — further spread
        ("25027", "Worcester",  "MA", 862111,  2, 10),
        ("25013", "Hampden",    "MA", 465825,  2, 12),
        # Providence RI — major hub, early spread
        ("44007", "Providence", "RI", 660741,  1, 6),
        ("44003", "Kent",       "RI", 170363,  2, 10),
        ("44009", "Washington", "RI", 129839,  2, 12),
        # Hartford + New Haven CT
        ("09003", "Hartford",   "CT", 899498,  1, 7),
        ("09009", "New Haven",  "CT", 864835,  1, 9),
        ("09001", "Fairfield",  "CT", 957419,  2, 11),
        ("09011", "New London", "CT", 268555,  2, 13),
        # NH
        ("33011", "Hillsborough","NH", 422937, 2, 10),
        ("33015", "Rockingham", "NH", 314176,  2, 12),
        ("33013", "Merrimack",  "NH", 153808,  3, 15),
        # ME
        ("23005", "Cumberland", "ME", 303069,  2, 11),
        ("23019", "Penobscot",  "ME", 152199,  3, 16),
        ("23031", "York",       "ME", 211972,  2, 13),
        # VT
        ("50007", "Chittenden", "VT", 168323,  3, 14),
        # Smaller MA
        ("25015", "Hampshire",  "MA", 162308,  2, 12),
        ("25003", "Berkshire",  "MA", 129026,  3, 16),
        ("25001", "Barnstable", "MA", 228996,  2, 13),
    ]

    # Background US counties at low baseline so NE stands out
    BACKGROUND_COUNTIES = [
        ("04013", "Maricopa",     "AZ", 4485448, 4, 0),
        ("04019", "Pima",         "AZ", 1059501, 4, 0),
        ("06037", "Los Angeles",  "CA", 9829544, 4, 0),
        ("06073", "San Diego",    "CA", 3298634, 4, 0),
        ("06059", "Orange",       "CA", 3175692, 4, 0),
        ("48201", "Harris",       "TX", 4731145, 4, 0),
        ("17031", "Cook",         "IL", 5150233, 4, 0),
        ("36061", "New York",     "NY", 1576876, 4, 0),
        ("36047", "Kings",        "NY", 2561225, 4, 0),
        ("36081", "Queens",       "NY", 2253858, 4, 0),
        ("36005", "Bronx",        "NY", 1418207, 4, 0),
        ("34013", "Essex",        "NJ", 862553,  4, 0),
        ("34003", "Bergen",       "NJ", 955732,  4, 0),
        ("42101", "Philadelphia", "PA", 1576251, 4, 0),
        ("11001", "District of Columbia", "DC", 689545, 4, 0),
        ("24033", "Prince George's","MD", 967201, 4, 0),
        ("51059", "Fairfax",      "VA", 1150309, 4, 0),
        ("53033", "King",         "WA", 2269675, 4, 0),
        ("41051", "Multnomah",    "OR", 815428,  4, 0),
        ("26163", "Wayne",        "MI", 1749367, 4, 0),
    ]

    symptom_pools_respiratory = [
        ["fever", "cough", "fatigue"],
        ["fever", "cough", "difficulty_breathing"],
        ["fever", "fatigue", "headache", "body_aches"],
        ["cough", "sore_throat", "runny_nose"],
        ["fever", "loss_of_smell_taste", "fatigue"],
        ["fever", "chills", "body_aches"],
        ["difficulty_breathing", "fever", "cough"],
        ["fatigue", "headache", "fever"],
    ]
    symptom_pools_mild = [
        ["cough", "fatigue"],
        ["headache", "fatigue"],
        ["runny_nose", "sore_throat"],
        ["cough"],
    ]
    age_groups = ["adult"] * 5 + ["elderly"] * 3 + ["child"] * 2

    # Growth curves indexed 0..29 (day 29 = today)
    # Tier 0: explosive — starts low, accelerates sharply
    EXPLOSIVE = [
        0.05, 0.06, 0.08, 0.10, 0.13, 0.17, 0.22, 0.28, 0.35, 0.43,
        0.52, 0.62, 0.72, 0.80, 0.87, 0.91, 0.94, 0.96, 0.97, 0.98,
        0.98, 0.99, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    ]
    # Tier 1: rapid spread, starts a few days later
    RAPID = [
        0.00, 0.00, 0.00, 0.00, 0.00, 0.04, 0.07, 0.11, 0.16, 0.22,
        0.29, 0.37, 0.46, 0.55, 0.64, 0.72, 0.79, 0.85, 0.90, 0.93,
        0.95, 0.97, 0.98, 0.99, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    ]
    # Tier 2: arriving later, still growing
    GROWING = [
        0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.02,
        0.04, 0.07, 0.11, 0.16, 0.22, 0.30, 0.38, 0.47, 0.56, 0.65,
        0.73, 0.80, 0.86, 0.90, 0.93, 0.95, 0.97, 0.98, 0.99, 1.00,
    ]
    # Tier 3: outer ring, just arriving
    EMERGING = [
        0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
        0.00, 0.00, 0.00, 0.00, 0.01, 0.02, 0.04, 0.07, 0.11, 0.16,
        0.22, 0.30, 0.39, 0.48, 0.57, 0.65, 0.72, 0.78, 0.84, 0.89,
    ]
    # Tier 4: background US — low flat baseline
    BACKGROUND = [0.15] * 30

    CURVES = [EXPLOSIVE, RAPID, GROWING, EMERGING, BACKGROUND]
    # Sick rates by tier
    SICK_RATES = [0.82, 0.74, 0.65, 0.55, 0.18]

    def base_daily(pop):
        if pop > 1_000_000: return 14
        if pop > 500_000:   return 9
        if pop > 200_000:   return 6
        if pop > 100_000:   return 4
        return 2

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = datetime.now().date()
    inserted = 0

    all_counties = NE_COUNTIES + BACKGROUND_COUNTIES

    for (fips, county_name, state, pop, tier, _) in all_counties:
        curve   = CURVES[tier]
        sr      = SICK_RATES[tier]
        base    = base_daily(pop)
        is_epicentre = tier <= 1
        symp_pool = symptom_pools_respiratory if tier <= 2 else symptom_pools_mild

        for day_offset, multiplier in enumerate(curve):
            if multiplier == 0.00:
                continue
            day = today - timedelta(days=(29 - day_offset))
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
                    symptoms = random.choice(symp_pool) if feeling == "sick" else []
                    age  = random.choice(age_groups)
                    hh   = random.randint(1, 5)
                    sick_hh = random.randint(1, min(hh, 3)) if feeling == "sick" and tier <= 1 else (
                        random.randint(0, min(hh - 1, 2)) if feeling == "sick" else 0
                    )
                    recent_travel = 1 if (is_epicentre and random.random() < 0.4) else (
                        1 if (tier == 2 and random.random() < 0.25) else 0
                    )
                    c.execute('''
                        INSERT INTO reports (
                            timestamp, zip_code, county, feeling, symptoms, age_group,
                            household_members, sick_household_members,
                            first_time_reporting, recent_travel, event_attendance,
                            animal_contact, sick_animals, water_concerns,
                            reporting_to_authority, is_demo, fips
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    ''', (
                        ts.isoformat(), fips, county_name, feeling,
                        json.dumps(symptoms), age, hh, sick_hh,
                        random.randint(0, 1),
                        recent_travel,
                        1 if (tier <= 1 and random.random() < 0.35) else 0,
                        0, 0, 0,
                        1 if (tier <= 2 and random.random() < 0.4) else 0,
                        fips,
                    ))
                    inserted += 1

    conn.commit()
    conn.close()
    return inserted


def seed_southern_az_outbreak():
    """
    Seed a realistic cross-border respiratory illness wave across Southern Arizona.

    Scenario: A novel respiratory illness enters through the Nogales port of entry in
    Santa Cruz County ~4 weeks ago, spreads east to Cochise, west to Yuma, and north
    into Pima (Tucson metro), Pinal, and rural Graham County.

    Demonstrates how CommunityPulse detects outbreaks in rural/border communities
    with limited healthcare access — the counties that need early warning most.
    """
    # (fips, county, state, pop, tier)
    # tier 0 = epicentre (Santa Cruz border crossing), tier 1 = border spread,
    # tier 2 = metro spillover, tier 3 = northward emerging
    AZ_COUNTIES = [
        # Santa Cruz — epicentre, Nogales port of entry
        ("04023", "Santa Cruz", "AZ", 47420,   0),
        # Yuma — western border, San Luis port of entry
        ("04027", "Yuma",       "AZ", 213787,  1),
        # Cochise — eastern border, cross-border exposure
        ("04003", "Cochise",    "AZ", 125922,  1),
        # Graham — rural mining county, limited healthcare
        ("04009", "Graham",     "AZ", 37532,   1),
        # Pima — Tucson metro spillover
        ("04019", "Pima",       "AZ", 1059501, 2),
        # Pinal — northward corridor spread
        ("04021", "Pinal",      "AZ", 425264,  2),
        # La Paz — small western rural county
        ("04012", "La Paz",     "AZ", 22113,   3),
        # Maricopa — distant Phoenix metro, minimal
        ("04013", "Maricopa",   "AZ", 4485448, 3),
    ]

    # Background national counties at low baseline so AZ cluster stands out
    BACKGROUND_COUNTIES = [
        ("06037", "Los Angeles",  "CA", 9829544, 4),
        ("06073", "San Diego",    "CA", 3298634, 4),
        ("48201", "Harris",       "TX", 4731145, 4),
        ("17031", "Cook",         "IL", 5150233, 4),
        ("36061", "New York",     "NY", 1576876, 4),
        ("53033", "King",         "WA", 2269675, 4),
        ("25025", "Suffolk",      "MA", 797936,  4),
        ("12086", "Miami-Dade",   "FL", 2716940, 4),
        ("48113", "Dallas",       "TX", 2613539, 4),
        ("42101", "Philadelphia", "PA", 1576251, 4),
    ]

    symptom_pools_respiratory = [
        ["Fever", "Cough / Congestion", "Fatigue"],
        ["Fever", "Difficulty Breathing", "Cough / Congestion"],
        ["Fever", "Muscle or Body Aches and Pains", "Headache"],
        ["Cough / Congestion", "Sore Throat", "Runny or Stuffy Nose"],
        ["Fever", "Loss of Smell or Taste", "Fatigue"],
        ["Fever", "Chills", "Muscle or Body Aches and Pains"],
        ["Fatigue", "Headache", "Fever"],
    ]
    symptom_pools_mild = [
        ["Cough / Congestion", "Fatigue"],
        ["Headache", "Fatigue"],
        ["Runny or Stuffy Nose", "Sore Throat"],
    ]
    age_groups = ["adult"] * 5 + ["elderly"] * 3 + ["child"] * 2

    # Growth curves indexed 0..29 (day 29 = today)
    EXPLOSIVE = [
        0.04, 0.06, 0.09, 0.12, 0.16, 0.21, 0.27, 0.34, 0.42, 0.51,
        0.61, 0.70, 0.78, 0.85, 0.90, 0.93, 0.95, 0.97, 0.98, 0.99,
        1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    ]
    RAPID = [
        0.00, 0.00, 0.00, 0.00, 0.03, 0.06, 0.10, 0.15, 0.21, 0.28,
        0.36, 0.45, 0.54, 0.63, 0.71, 0.78, 0.84, 0.89, 0.93, 0.96,
        0.97, 0.98, 0.99, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    ]
    GROWING = [
        0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.02, 0.04, 0.07,
        0.11, 0.16, 0.22, 0.29, 0.37, 0.46, 0.55, 0.64, 0.72, 0.79,
        0.85, 0.90, 0.93, 0.95, 0.97, 0.98, 0.99, 1.00, 1.00, 1.00,
    ]
    EMERGING = [
        0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
        0.00, 0.00, 0.01, 0.03, 0.06, 0.10, 0.15, 0.21, 0.28, 0.36,
        0.45, 0.54, 0.63, 0.71, 0.78, 0.83, 0.87, 0.91, 0.94, 0.96,
    ]
    BACKGROUND = [0.12] * 30

    CURVES    = [EXPLOSIVE, RAPID, GROWING, EMERGING, BACKGROUND]
    SICK_RATES = [0.72, 0.58, 0.38, 0.28, 0.10]

    def base_daily(pop):
        if pop > 1_000_000: return 12
        if pop > 500_000:   return 7
        if pop > 200_000:   return 5
        if pop > 100_000:   return 3
        if pop > 50_000:    return 2
        return 1

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    today = datetime.now().date()
    inserted = 0

    all_counties = [(fips, county, state, pop, tier) for (fips, county, state, pop, tier) in AZ_COUNTIES] + \
                   [(fips, county, state, pop, tier) for (fips, county, state, pop, tier) in BACKGROUND_COUNTIES]

    for (fips, county_name, state, pop, tier) in all_counties:
        curve   = CURVES[min(tier, 4)]
        sr      = SICK_RATES[min(tier, 4)]
        base    = base_daily(pop)
        is_border = tier <= 1
        symp_pool = symptom_pools_respiratory if tier <= 2 else symptom_pools_mild

        for day_offset, multiplier in enumerate(curve):
            if multiplier == 0.00:
                continue

            day = today - timedelta(days=(29 - day_offset))
            dow_factor = 0.80 if day.weekday() >= 5 else 1.0
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
                    symptoms = random.choice(symp_pool) if feeling == "sick" else []
                    age  = random.choice(age_groups)
                    hh   = random.randint(1, 5)
                    sick_hh = random.randint(1, min(hh, 3)) if feeling == "sick" and tier <= 1 else (
                        random.randint(0, min(hh - 1, 2)) if feeling == "sick" else 0
                    )
                    # Border counties have high recent_travel (cross-border commuters)
                    recent_travel = 1 if (is_border and random.random() < 0.55) else (
                        1 if (tier == 2 and random.random() < 0.20) else 0
                    )
                    c.execute('''
                        INSERT INTO reports (
                            timestamp, zip_code, county, feeling, symptoms, age_group,
                            household_members, sick_household_members,
                            first_time_reporting, recent_travel, event_attendance,
                            animal_contact, sick_animals, water_concerns,
                            reporting_to_authority, is_demo, fips
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                    ''', (
                        ts.isoformat(), fips, county_name, feeling,
                        json.dumps(symptoms), age, hh, sick_hh,
                        random.randint(0, 1),
                        recent_travel,
                        1 if (tier <= 1 and random.random() < 0.30) else 0,
                        1 if (is_border and random.random() < 0.15) else 0,  # animal contact higher in rural AZ
                        0, 0,
                        1 if (tier <= 2 and random.random() < 0.35) else 0,
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
