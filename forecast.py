import sqlite3
from datetime import datetime, timedelta
from database import get_reports_by_county, get_all_county_counts, DB_PATH

def detect_cluster(county, window_days=3, threshold=5):
    rows = get_reports_by_county(county, days=14)

    # Build date -> count dict
    date_counts = {row[0]: row[1] for row in rows}

    # Fill all 14 days
    today = datetime.now().date()
    all_dates = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    counts = [date_counts.get(d, 0) for d in all_dates]

    # Chart data: last 7 days
    chart_data = [{"date": all_dates[i], "count": counts[i]} for i in range(7, 14)]

    # Past 72h total
    recent_count = sum(counts[-3:])

    # Prior 7-day window
    prior_week = sum(counts[-10:-3])

    # Trend %
    if prior_week == 0:
        trend_pct = 0 if recent_count == 0 else 100.0
    else:
        trend_pct = round(((recent_count - prior_week) / prior_week) * 100, 1)

    # Cluster: 3 consecutive days of growth AND count above threshold
    recent_days = counts[-window_days:]
    is_growing = all(
        recent_days[i] <= recent_days[i + 1]
        for i in range(len(recent_days) - 1)
    )
    is_cluster = is_growing and recent_count >= threshold

    # Forecast label
    if trend_pct > 20:
        forecast = "growing"
    elif trend_pct < -20:
        forecast = "declining"
    else:
        forecast = "stable"

    return {
        "is_cluster": is_cluster,
        "report_count": recent_count,
        "trend_pct": trend_pct,
        "forecast": forecast,
        "chart_data": chart_data,
    }

def get_community_risk_map():
    """Return risk entries for every county that has sick reports in the past 3 days."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        SELECT fips, county, COUNT(*) AS count
        FROM reports
        WHERE feeling = 'sick'
          AND timestamp >= datetime('now', '-3 days')
          AND fips IS NOT NULL AND fips != ''
        GROUP BY fips
    """)
    rows = c.fetchall()
    conn.close()

    result = []
    for fips, county_name, count in rows:
        cluster = detect_cluster(county_name)
        trend = cluster["trend_pct"]

        if count >= 20 or (count >= 10 and trend > 30):
            risk_level = "high"
        elif count >= 8 or (count >= 5 and trend > 20):
            risk_level = "medium"
        else:
            risk_level = "low"

        result.append({
            "fips":         fips,
            "county":       county_name,
            "report_count": count,
            "trend_pct":    trend,
            "risk_level":   risk_level,
            "is_cluster":   cluster["is_cluster"],
        })

    return result
