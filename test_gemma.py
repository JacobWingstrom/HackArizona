#!/usr/bin/env python3
"""
Quick test script for Gemma model integration via Ollama.

Run `ollama serve` in another terminal, then `ollama pull gemma4:e4b`.
"""

from gemma_model import get_predictor

def test_health_check():
    print("Health check...")
    p = get_predictor()
    if p.health_check():
        print("✅ Using LOCAL OLLAMA (offline, free)")
        return True
    else:
        print("❌ Ollama not available — run: ollama serve && ollama pull gemma4:e4b")
        return False



def test_individual_risk():
    print("\n📊 Testing individual risk prediction...")
    p = get_predictor()

    result = p.predict_individual_risk(
        symptoms=["cough", "fever", "sore_throat"],
        feeling="sick",
        household_sick=2,
        county="Pima",
        weather_data={"temp": 75, "condition": "sunny"},
        county_trend={"trend_pct": 15, "forecast": "growing", "report_count": 12}
    )

    print(f"  Risk Level: {result.get('risk_level')}")
    print(f"  Risk Score: {result.get('risk_score')}/100")
    print(f"  Reasoning: {result.get('reasoning')}")
    print(f"  Action: {result.get('action_recommended')}")
    print(f"  Confidence: {result.get('confidence')}%")
    return result


def test_county_forecast():
    print("\n📈 Testing county outbreak forecast...")
    p = get_predictor()

    result = p.predict_county_outbreak(
        county="Pima",
        recent_reports=24,
        trend_pct=18.5,
        chart_data=[
            {"date": "2026-04-18", "count": 8},
            {"date": "2026-04-19", "count": 10},
            {"date": "2026-04-20", "count": 12},
            {"date": "2026-04-21", "count": 14},
            {"date": "2026-04-22", "count": 18},
            {"date": "2026-04-23", "count": 20},
            {"date": "2026-04-24", "count": 24},
        ],
        travel_inbound=["Phoenix (Maricopa)", "Tucson skyport"]
    )

    print(f"  Forecast: {result.get('forecast')}")
    print(f"  Predicted 7-day reports: {result.get('predicted_reports_7d')}")
    print(f"  Confidence: {result.get('confidence')}%")
    print(f"  Key factors: {', '.join(result.get('key_factors', []))}")
    print(f"  Reasoning: {result.get('reasoning')}")
    return result


def test_recommendations():
    print("\n💡 Testing personalized recommendations...")
    p = get_predictor()

    result = p.personalized_recommendations(
        user_profile={
            "age_group": "35-45",
            "conditions": ["mild asthma"]
        },
        symptom_history=[
            {"date": "2026-04-20", "symptoms": ["cough"]},
            {"date": "2026-04-21", "symptoms": ["cough", "fatigue"]},
            {"date": "2026-04-22", "symptoms": ["fever", "cough"]},
        ],
        risk_score=72,
        county_trend={"forecast": "growing", "trend_pct": 20}
    )

    print(f"  Urgency: {result.get('notification_urgency')}")
    print(f"  Recommendations:")
    for rec in result.get("recommendations", [])[:3]:
        print(f"    - [{rec.get('priority')}] {rec.get('action')} ({rec.get('why')})")
    print(f"  Wellness tips: {', '.join(result.get('wellness_tips', [])[:2])}")
    return result


def test_pattern_analysis():
    print("\n🔬 Testing pattern analysis...")
    p = get_predictor()

    # Simulate historical data
    historical = [
        {"symptoms": ["cough", "fever"]} for _ in range(15)
    ] + [
        {"symptoms": ["runny_nose", "sore_throat"]} for _ in range(10)
    ] + [
        {"symptoms": ["fatigue"]} for _ in range(5)
    ]

    result = p.analyze_patterns(historical, "Pima")

    print(f"  Patterns: {', '.join(result.get('patterns', [])[:2])}")
    print(f"  Seasonality: {result.get('seasonality')}")
    print(f"  High-risk profiles: {len(result.get('high_risk_profiles', []))} identified")
    print(f"  Insights: {result.get('insights')[:100]}...")
    return result


if __name__ == "__main__":
    print("=" * 60)
    print("Gemma 4 Model Integration Tests")
    print("=" * 60)

    try:
        if not test_health_check():
            exit(1)

        test_individual_risk()
        test_county_forecast()
        test_recommendations()
        test_pattern_analysis()

        print("\n" + "=" * 60)
        print("✅ All tests passed! Gemma integration is working.")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
