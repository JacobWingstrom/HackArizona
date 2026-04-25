import React, { useState } from 'react';
import { submitCheckin } from '../api';

const SYMPTOMS = [
  { id: 'fever', label: '🌡️ Fever' },
  { id: 'cough', label: '😮‍💨 Cough' },
  { id: 'difficulty breathing', label: '😤 Difficulty breathing' },
  { id: 'loss of smell/taste', label: '👃 Loss of smell/taste' },
  { id: 'fatigue', label: '😴 Fatigue' },
  { id: 'headache', label: '🤕 Headache' },
  { id: 'nausea', label: '🤢 Nausea / vomiting' },
  { id: 'sore throat', label: '🔴 Sore throat' },
];

const TOGGLES = [
  { id: 'first_time_reporting', label: '🔔 First time reporting these symptoms' },
  { id: 'recent_travel', label: '✈️ Traveled in the past 2 weeks' },
  { id: 'event_attendance', label: '🎪 Attended a large event recently' },
  { id: 'animal_contact', label: '🐄 Had contact with animals / livestock' },
  { id: 'water_concerns', label: '💧 Concerns about local water source' },
  { id: 'reporting_to_authority', label: '🏥 Reporting to health authority' },
];

export default function SymptomForm({ setView, setResults, setFormData }) {
  const [symptoms, setSymptoms] = useState([]);
  const [zip, setZip] = useState(localStorage.getItem('cp_zip') || '');
  const [ageGroup, setAgeGroup] = useState(localStorage.getItem('cp_age_group') || 'adult');
  const [householdMembers, setHouseholdMembers] = useState(1);
  const [sickMembers, setSickMembers] = useState(0);
  const [toggles, setToggles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleSymptom(id) {
    setSymptoms(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  }

  function toggleField(id) {
    setToggles(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!zip || zip.length < 5) { setError('Please enter a valid 5-digit zip code.'); return; }
    if (symptoms.length === 0) { setError('Please select at least one symptom.'); return; }

    setError('');
    setLoading(true);

    // Cache user preferences
    localStorage.setItem('cp_zip', zip);
    localStorage.setItem('cp_age_group', ageGroup);

    // Update streak
    const today = new Date().toDateString();
    const last = localStorage.getItem('cp_last_checkin');
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let streak = parseInt(localStorage.getItem('cp_streak') || '0');
    if (last !== today) {
      streak = last === yesterday ? streak + 1 : 1;
      localStorage.setItem('cp_streak', streak);
      localStorage.setItem('cp_last_checkin', today);
    }

    const data = {
      feeling: 'sick',
      symptoms,
      zip_code: zip,
      age_group: ageGroup,
      household_members: parseInt(householdMembers),
      sick_household_members: parseInt(sickMembers),
      ...toggles,
    };

    try {
      const results = await submitCheckin(data);
      setFormData(data);
      setResults(results);
      setView('results');
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div className="loading-text">Analyzing community data...</div>
        <div className="text-muted mt-8" style={{ fontSize: '0.8rem' }}>
          Checking WHO reports, local trends, and your symptom profile
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-header">
        <h2>Tell us how you're feeling</h2>
        <p>Your report is anonymous and helps detect outbreaks in your community.</p>
      </div>

      {/* Symptoms */}
      <div className="form-section">
        <h3>Symptoms</h3>
        <div className="symptom-grid">
          {SYMPTOMS.map(s => (
            <div
              key={s.id}
              className={`symptom-chip ${symptoms.includes(s.id) ? 'selected' : ''}`}
              onClick={() => toggleSymptom(s.id)}
            >
              <span className="symptom-chip-dot" />
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* Location & Demographics */}
      <div className="form-section">
        <h3>About You</h3>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Zip Code</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. 85721"
              maxLength={5}
              value={zip}
              onChange={e => setZip(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Age Group</label>
            <select
              className="form-input"
              value={ageGroup}
              onChange={e => setAgeGroup(e.target.value)}
            >
              <option value="child">Child (under 18)</option>
              <option value="adult">Adult (18–64)</option>
              <option value="elderly">Elderly (65+)</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Household members</label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={20}
              value={householdMembers}
              onChange={e => setHouseholdMembers(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Sick household members</label>
            <input
              className="form-input"
              type="number"
              min={0}
              max={20}
              value={sickMembers}
              onChange={e => setSickMembers(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* One Health Toggles */}
      <div className="form-section">
        <h3>One Health Factors</h3>
        <div className="toggle-list">
          {TOGGLES.map(t => (
            <div
              key={t.id}
              className={`toggle-item ${toggles[t.id] ? 'active' : ''}`}
              onClick={() => toggleField(t.id)}
            >
              <span>{t.label}</span>
              <div className={`toggle-pill ${toggles[t.id] ? 'on' : ''}`} />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: '0.875rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={loading}>
        Analyze My Risk →
      </button>
      <button
        type="button"
        className="btn btn-secondary mt-8"
        onClick={() => setView('checkin')}
      >
        ← Back
      </button>
    </form>
  );
}
