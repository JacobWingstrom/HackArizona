"""
Run this once to seed realistic symptom reports for the demo.
Usage: python3 data/seed_reports.py
Creates a cluster in Pima County (85721) — the demo zip code.
"""
import sqlite3
import json
import random
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import init_db, DB_PATH

init_db()

SYMPTOM_COMBOS = [
    ["fever", "cough"],
    ["fever", "cough", "fatigue"],
    ["fever", "cough", "sore throat"],
    ["cough", "fatigue", "headache"],
    ["fever", "fatigue"],
    ["cough", "sore throat"],
    ["fever", "cough", "difficulty breathing"],
    ["fatigue", "headache", "nausea"],
    ["fever", "loss of smell/taste", "fatigue"],
    ["cough", "fever", "headache"],
]

AGE_GROUPS = (["adult"] * 6) + (["elderly"] * 3) + (["child"] * 1)

# (county, zip, daily_counts_past_7_days oldest→newest)
COUNTY_PROFILES = [
    ("Pima",      "85721", [8, 12, 18, 27, 41, 47, 52]),   # CLUSTER — demo target
    ("Maricopa",  "85001", [15, 14, 16, 15, 17, 16, 15]),  # STABLE moderate
    ("Cochise",   "85601", [3,  2,  4,  3,  2,  4,  3]),   # LOW
    ("Yavapai",   "86301", [2,  3,  2,  4,  3,  2,  3]),   # LOW
    ("Coconino",  "86001", [1,  2,  1,  2,  1,  3,  2]),   # LOW
    ("Pinal",     "85120", [4,  5,  4,  6,  5,  4,  5]),   # LOW-MEDIUM
    ("Navajo",    "85901", [2,  1,  2,  2,  3,  2,  1]),   # LOW
]

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

today = datetime.now().date()
total = 0

for county, zip_code, daily_counts in COUNTY_PROFILES:
    for days_ago, count in enumerate(reversed(daily_counts)):
        report_date = today - timedelta(days=days_ago)
        for _ in range(count):
            hour = random.randint(6, 22)
            minute = random.randint(0, 59)
            timestamp = datetime.combine(
                report_date, datetime.min.time()
            ).replace(hour=hour, minute=minute)

            symptoms = random.choice(SYMPTOM_COMBOS)
            age_group = random.choice(AGE_GROUPS)

            c.execute('''
                INSERT INTO reports (timestamp, zip_code, county, feeling, symptoms,
                    age_group, household_members, sick_household_members,
                    first_time_reporting, recent_travel, event_attendance,
                    animal_contact, sick_animals, water_concerns, reporting_to_authority)
                VALUES (?, ?, ?, 'sick', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                timestamp.isoformat(),
                zip_code,
                county,
                json.dumps(symptoms),
                age_group,
                random.randint(1, 5),
                random.randint(0, 2),
                random.choice([0, 1]),
                random.choice([0, 0, 0, 1]),
                random.choice([0, 0, 0, 1]),
                random.choice([0, 0, 1]),
                random.choice([0, 0, 0, 1]),
                random.choice([0, 0, 0, 0, 1]),
                random.choice([0, 0, 0, 0, 1]),
            ))
            total += 1

conn.commit()
conn.close()
print(f"✓ Seeded {total} reports across {len(COUNTY_PROFILES)} counties.")
print("✓ Pima County cluster: ~47 reports in past 72h, trend GROWING.")
print("✓ Demo zip 85721 is ready.")
