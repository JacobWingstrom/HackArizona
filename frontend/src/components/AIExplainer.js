import React, { useState } from 'react';

export default function AIExplainer({ explanation, reportCount, county }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="accordion">
      <button className="accordion-trigger" onClick={() => setOpen(!open)}>
        <span>🔍 How did we calculate this?</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="accordion-body">
          {explanation && <p>{explanation}</p>}
          <p>
            <strong style={{ color: 'var(--text)' }}>Data sources used:</strong> Self-reported symptoms
            from CommunityPulse users in {county || 'your'} County ({reportCount || 0} reports in past 72h),
            Epicore verified outbreak event database (60-day window), BEACON biosurveillance
            (PHI Research Lab), CDC FluView ILI surveillance for HHS Region 9 (Arizona),
            and OpenWeatherMap local weather data.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>AI model:</strong> OpenAI GPT-4o analyzes your
            report alongside community data using the One Health framework — combining human, animal,
            and environmental signals.
          </p>
          <p>
            <strong style={{ color: 'var(--text)' }}>What we don't know:</strong> Self-reported data
            may underrepresent actual cases. More community reports = more accurate results.
            Confidence increases as participation grows.
          </p>
          <p style={{ color: 'var(--red)', fontWeight: 600 }}>
            This is not medical advice. CommunityPulse is a surveillance tool, not a diagnostic service.
            Always consult a licensed healthcare provider for medical decisions.
          </p>
        </div>
      )}
    </div>
  );
}
