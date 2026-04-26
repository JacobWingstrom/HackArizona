"""
Gemma 4 powered prediction model for individual & community risk assessment.

Backend: Local Ollama instance (free, offline, private)

Generates:
1. Individual risk scores with reasoning
2. County-level outbreak forecasts
3. Personalized health recommendations
"""

import json
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

# Ollama local endpoint (default is localhost:11434)
OLLAMA_API = "http://localhost:11434/api/generate"
OLLAMA_EMBED = "http://localhost:11434/api/embeddings"
OLLAMA_MODEL = "gemma4:e2b"  # Can also use gemma4:e4b for higher quality (needs ~10GB RAM)


class GemmaPredictor:
    def __init__(self, model_name=None, api_url=OLLAMA_API):
        """
        Initialize predictor using local Ollama.

        Args:
            model_name: Override model name
            api_url: Override Ollama API endpoint
        """
        self.ollama_api = api_url
        self.ollama_model = model_name or OLLAMA_MODEL
        self.backend = None
        self.ollama_available = False

        if self._check_ollama():
            self.backend = "ollama"
            self.ollama_available = True
    
    def _check_ollama(self) -> bool:
        """Verify Ollama server is running."""
        try:
            r = requests.post(
                self.ollama_api,
                json={"model": self.ollama_model, "prompt": ".", "stream": False},
                timeout=60
            )
            return r.status_code == 200
        except Exception:
            return False

    def health_check(self) -> bool:
        """Check which backend is available."""
        return self.backend is not None

    def generate(self, prompt: str, temperature: float = 0.7, system: str = "") -> Optional[str]:
        """Generate response from Gemma via Ollama."""
        if self.ollama_available:
            return self._generate_ollama(prompt, temperature, system)
        return None

    def _generate_ollama(self, prompt: str, temperature: float, system: str = "") -> Optional[str]:
        """Generate via local Ollama."""
        try:
            body = {
                "model": self.ollama_model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": temperature},
            }
            if system:
                body["system"] = system
            r = requests.post(self.ollama_api, json=body, timeout=90)
            if r.status_code == 200:
                return r.json()["response"].strip()
        except Exception as e:
            print(f"Ollama generation failed: {e}")
        return None

    def predict_individual_risk(
        self,
        symptoms: List[str],
        feeling: str,
        household_sick: int,
        county: str,
        travel_history: Optional[Dict] = None,
        weather_data: Optional[Dict] = None,
        county_trend: Optional[Dict] = None,
    ) -> Dict:
        """
        Generate individual risk assessment with Gemma.
        Returns: {
            "risk_level": "low|medium|high|critical",
            "risk_score": 0-100,
            "reasoning": "explanation",
            "action_recommended": "action",
            "confidence": 0-100
        }
        """
        # Build context
        symptoms_str = ", ".join(symptoms) if symptoms else "no reported symptoms"
        location_info = f"in {county} county"
        trend_info = ""
        if county_trend:
            trend_info = f"\nCounty trend: {county_trend.get('trend_pct', 0)}% change, {county_trend.get('report_count', 0)} recent reports"

        weather_info = ""
        if weather_data:
            weather_info = f"\nWeather: {weather_data.get('temp', 'N/A')}°F, {weather_data.get('condition', 'unknown')}"

        travel_info = ""
        if travel_history and travel_history.get("recent_travel"):
            travel_info = f"\nRecent travel: {', '.join(travel_history['recent_travel'][:3])}"

        prompt = f"""You are a One Health surveillance expert analyzing individual disease risk.

Patient data:
- Symptoms: {symptoms_str}
- General feeling: {feeling}
- Sick household members: {household_sick}
- Location: {location_info}{travel_info}{weather_info}{trend_info}

Analyze this patient's risk on a scale of low/medium/high/critical.
Consider symptom severity, household spread, community trend, and travel exposure.

Respond in JSON format ONLY (no markdown, no code blocks):
{{
  "risk_level": "low|medium|high|critical",
  "risk_score": <0-100>,
  "reasoning": "<brief explanation>",
  "action_recommended": "<action patient should take>",
  "confidence": <0-100>
}}"""

        response = self.generate(prompt, temperature=0.5)
        if not response:
            return self._default_risk_response()

        try:
            # Clean response (Ollama sometimes adds extra text)
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                result = json.loads(json_str)
                return result
        except Exception as e:
            print(f"JSON parse error in risk prediction: {e}")

        return self._default_risk_response()

    def predict_county_outbreak(
        self,
        county: str,
        recent_reports: int,
        trend_pct: float,
        chart_data: List[Dict],
        travel_inbound: Optional[List[str]] = None,
        historical_data: Optional[Dict] = None,
    ) -> Dict:
        """
        Forecast county-level outbreak likelihood (next 7-14 days).
        Returns: {
            "forecast": "stable|rising|falling",
            "predicted_reports_7d": <int>,
            "confidence": 0-100,
            "key_factors": [...]
        }
        """
        chart_str = "; ".join([f"{d['date']}: {d['count']} reports" for d in chart_data[-7:]])
        travel_str = ""
        if travel_inbound:
            travel_str = f"\nInbound travel from: {', '.join(travel_inbound[:3])}"

        prompt = f"""You are an epidemiologist analyzing county-level disease trends.

County: {county}
- Recent reports (3d): {recent_reports}
- Trend: {trend_pct:+.1f}% vs prior week
- 7-day trend: {chart_str}{travel_str}

Predict the next 7-14 day trajectory (stable/rising/falling).
Estimate expected report count in 7 days.
Consider momentum, seasonality, and travel patterns.

Respond in JSON format ONLY:
{{
  "forecast": "stable|rising|falling",
  "predicted_reports_7d": <estimated count>,
  "confidence": <50-95>,
  "key_factors": ["factor1", "factor2", "factor3"],
  "reasoning": "<brief summary>"
}}"""

        response = self.generate(prompt, temperature=0.6)
        if not response:
            return self._default_county_forecast()

        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                result = json.loads(json_str)
                return result
        except Exception as e:
            print(f"JSON parse error in county forecast: {e}")

        return self._default_county_forecast()

    def personalized_recommendations(
        self,
        user_profile: Dict,
        symptom_history: List[Dict],
        risk_score: int,
        county_trend: Dict,
    ) -> Dict:
        """
        Generate personalized health recommendations based on individual profile & history.
        Returns: {
            "recommendations": [
                {"action": "...", "priority": "high|medium|low", "why": "..."},
                ...
            ],
            "wellness_tips": [...],
            "notification_urgency": "urgent|moderate|low"
        }
        """
        recent_symp = []
        if symptom_history:
            # Get last 7 days of symptom patterns
            for s in symptom_history[-7:]:
                recent_symp.append(s.get("symptoms", []))

        prompt = f"""You are a personal health advisor using One Health data.

User profile:
- Age group: {user_profile.get('age_group', 'unknown')}
- Risk score: {risk_score}/100
- County trend: {county_trend.get('trend_pct', 0):+.1f}% ({county_trend.get('forecast','stable')})
- Chronic conditions: {', '.join(user_profile.get('conditions', ['none'])) or 'none'}

Recent symptoms across check-ins: {recent_symp[-3:] if len(recent_symp) > 0 else 'none yet'}

Provide 3-5 personalized recommendations for this user given their risk profile.
Prioritize by urgency. Include preventive wellness tips.

Respond in JSON format ONLY:
{{
  "recommendations": [
    {{"action": "...", "priority": "high|medium|low", "why": "..."}},
    ...
  ],
  "wellness_tips": ["tip1", "tip2"],
  "notification_urgency": "urgent|moderate|low"
}}"""

        response = self.generate(prompt, temperature=0.7)
        if not response:
            return self._default_recommendations()

        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                result = json.loads(json_str)
                return result
        except Exception as e:
            print(f"JSON parse error in recommendations: {e}")

        return self._default_recommendations()

    def analyze_patterns(
        self,
        historical_reports: List[Dict],
        County: str,
    ) -> Dict:
        """
        Learn from historical data to identify patterns.
        Returns: {
            "patterns": [...],
            "seasonality": "...",
            "high_risk_profiles": [...],
            "insights": "..."
        }
        """
        if not historical_reports or len(historical_reports) < 5:
            return {
                "patterns": ["Insufficient data for analysis"],
                "seasonality": "unknown",
                "high_risk_profiles": [],
                "insights": "Need more historical data to identify trends."
            }

        # Aggregate data
        symptom_freq = {}
        for report in historical_reports[-50:]:  # Last 50 reports
            for sym in report.get("symptoms", []):
                symptom_freq[sym] = symptom_freq.get(sym, 0) + 1

        top_symptoms = sorted(symptom_freq.items(), key=lambda x: x[1], reverse=True)[:5]

        prompt = f"""Analyze disease patterns from historical surveillance data.

County: {County}
- Total reports analyzed: {len(historical_reports)}
- Top symptoms: {', '.join([f'{sym} ({count})' for sym, count in top_symptoms])}
- Time period: last {min(90, len(historical_reports) * 2)} days

Identify underlying patterns and suggest what profiles are at highest risk.

Respond in JSON format ONLY:
{{
  "patterns": ["pattern1", "pattern2"],
  "seasonality": "description",
  "high_risk_profiles": [
    {{"profile": "...", "why": "...", "prevalence": "..."}},
    ...
  ],
  "insights": "summary of key findings"
}}"""

        response = self.generate(prompt, temperature=0.6)
        if not response:
            return {"patterns": [], "seasonality": "unknown", "high_risk_profiles": [], "insights": ""}

        try:
            json_start = response.find("{")
            json_end = response.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                result = json.loads(json_str)
                return result
        except Exception as e:
            print(f"JSON parse error in pattern analysis: {e}")
            return {"patterns": [], "seasonality": "unknown", "high_risk_profiles": [], "insights": ""}

    # --- Default responses for fallbacks ---

    def _default_risk_response(self) -> Dict:
        return {
            "risk_level": "medium",
            "risk_score": 50,
            "reasoning": "Assessment unavailable; using baseline risk",
            "action_recommended": "Monitor symptoms; consult local health department if worsens",
            "confidence": 40
        }

    def _default_county_forecast(self) -> Dict:
        return {
            "forecast": "stable",
            "predicted_reports_7d": 0,
            "confidence": 30,
            "key_factors": ["Insufficient data"],
            "reasoning": "Forecast model initializing..."
        }

    def _default_recommendations(self) -> Dict:
        return {
            "recommendations": [
                {"action": "Stay hydrated", "priority": "high", "why": "Basic health maintenance"},
                {"action": "Monitor for symptom changes", "priority": "high", "why": "Early detection support"},
            ],
            "wellness_tips": ["Get adequate sleep", "Practice good hygiene"],
            "notification_urgency": "low"
        }


# Singleton instance
predictor = None

def get_predictor() -> GemmaPredictor:
    """Get or create the Gemma predictor instance."""
    global predictor
    if predictor is None:
        predictor = GemmaPredictor()
        if predictor.backend:
            print("✅ Gemma predictor initialized (OLLAMA, local, offline)")
        else:
            print("⚠️  No Gemma backend available — start Ollama and pull gemma4:e4b")
    return predictor


def initialize_gemma(model_name=None, api_url=OLLAMA_API):
    """Initialize Gemma predictor with custom settings."""
    global predictor
    predictor = GemmaPredictor(model_name=model_name, api_url=api_url)
    return predictor
