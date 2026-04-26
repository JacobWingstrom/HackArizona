# Gemma 4 Prediction Model Setup

## Quick Start

### 1. Install Ollama

**macOS:**
```bash
brew install ollama
```

Then start the Ollama server:
```bash
ollama serve
```

The server will run on `http://localhost:11434` (default).

**Linux:**
```bash
curl https://ollama.ai/install.sh | sh
ollama serve
```

**Windows:**
Download from [ollama.ai](https://ollama.ai)

### 2. Pull Gemma Model

In a new terminal (while ollama serve is running):
```bash
# For faster inference on hackathon (smaller model)
ollama pull gemma:4b

# Or for better quality predictions (slower)
# ollama pull gemma:7b
```

This downloads ~2GB (4b) or ~5GB (7b) model. First pull takes 2-5 minutes depending on internet.

### 3. Verify Installation

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "gemma:4b",
  "prompt": "What is 2+2?",
  "stream": false
}'
```

Should return a JSON response with the answer.

### 4. Run Prediction Tests

```bash
python3 test_gemma.py
```

## Model Configuration

In `app.py` or `gemma_model.py`, you can adjust:

```python
MODEL = "gemma:4b"  # or gemma:7b for better quality
```

## API Endpoints (New)

Once integrated into app.py:

### Individual Risk Prediction
```bash
POST /api/risk-predict
Content-Type: application/json

{
  "symptoms": ["cough", "fever"],
  "feeling": "sick",
  "zip_code": "85721",
  "household_members": 3,
  "sick_household_members": 1
}

Response:
{
  "risk_level": "medium",
  "risk_score": 65,
  "reasoning": "...",
  "action_recommended": "...",
  "confidence": 78
}
```

### County Outbreak Forecast
```bash
GET /api/county-forecast?county=Pima

Response:
{
  "county": "Pima",
  "forecast": "rising",
  "predicted_reports_7d": 45,
  "confidence": 82,
  "key_factors": ["Inbound travel from hot zones", "Upward trend"],
  "reasoning": "..."
}
```

### Personalized Recommendations
```bash
GET /api/personal-recommendations
Authorization: Bearer <token>

Response:
{
  "recommendations": [
    {
      "action": "Notify your household members of your symptoms",
      "priority": "high",
      "why": "Multiple household members already sick; high household transmission risk"
    },
    ...
  ],
  "wellness_tips": ["..."],
  "notification_urgency": "moderate"
}
```

### Pattern Analysis
```bash
GET /api/patterns?county=Pima&days=30

Response:
{
  "patterns": ["Respiratory symptoms dominate", "..."],
  "seasonality": "Spring peak expected",
  "high_risk_profiles": [...],
  "insights": "..."
}
```

## Troubleshooting

### "Connection refused" error
- Make sure `ollama serve` is running in another terminal
- Check `http://localhost:11434` is accessible

### Model not found
```bash
ollama pull gemma:4b
```

### Slow responses
- Using gemma:4b should give responses in 5-10 seconds
- If slower, check CPU/RAM availability
- Switch to GPU if available: `ollama --gpu`

### Gemma returns `None`
- Check Ollama server logs
- Verify JSON parsing in response (Ollama sometimes adds prefix/suffix text)
- Fall back responses are triggered if JSON parsing fails

## Performance Notes

- **gemma:4b**: ~5-10s per prediction on CPU, runs on systems with 4GB+ RAM
- **gemma:7b**: ~15-20s per prediction on CPU, needs 8GB+ RAM
- For hackathon, **gemma:4b is recommended** for speed
- Cache results in production to avoid repeated inference

## Integration with CommunityPulse

The Gemma model enhances existing workflow:

1. **User Check-in** → Saves report → Generates individual risk (Gemma) + voice output
2. **County Detail** → Fetches Gemma forecast instead of/alongside GPT-4o analysis
3. **Profile Page** → Shows Gemma-generated personalized recommendations
4. **Backend Dashboard** → Pattern analysis for epidemiologists

Current flow uses GPT-4o. Can replace or augment with Gemma for:
- Offline capability (Gemma is local, no API keys needed)
- Cost savings (no per-API charges)
- Custom fine-tuning if needed later
