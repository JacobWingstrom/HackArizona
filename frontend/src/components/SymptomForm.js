import React, { useState } from 'react';
import { submitCheckin } from '../api';
import CountyPicker from './CountyPicker';

// Symptom categories — One Health minimum dataset (EpiHack standard)
// Cross-referenced with HealthMap / Outbreaks Near Me surveillance taxonomy
const SYMPTOM_CATEGORIES = [
  {
    label: 'Whole Body',
    symptoms: [
      { id: 'Fever',                          label: 'Fever' },
      { id: 'Chills',                         label: 'Chills / Night Sweats' },
      { id: 'Muscle or Body Aches and Pains', label: 'Muscle or Body Aches and Pains' },
      { id: 'Fatigue',                        label: 'Fatigue' },
      { id: 'Yellow Skin or Eyes',            label: 'Yellow Skin / Yellow Eyes (Jaundice)' },
    ],
  },
  {
    label: 'Respiratory',
    symptoms: [
      { id: 'Cough / Congestion',             label: 'Cough / Congestion' },
      { id: 'Difficulty Breathing',           label: 'Difficulty Breathing' },
      { id: 'Sore Throat',                    label: 'Sore Throat' },
      { id: 'Loss of Smell or Taste',         label: 'Loss of Smell or Taste' },
      { id: 'Runny or Stuffy Nose',           label: 'Runny or Stuffy Nose' },
      { id: 'Chest Tightness',               label: 'Chest Tightness' },
    ],
  },
  {
    label: 'Digestive',
    symptoms: [
      { id: 'Nausea / Vomiting',             label: 'Nausea / Vomiting' },
      { id: 'Diarrhea',                      label: 'Diarrhea' },
      { id: 'Stomach Pain or Cramps',        label: 'Stomach Pain or Cramps' },
      { id: 'Loss of Appetite',              label: 'Loss of Appetite' },
    ],
  },
  {
    label: 'Skin, Eyes & Other',
    symptoms: [
      { id: 'Rash',                          label: 'Rash' },
      { id: 'Red Eyes',                      label: 'Red Eyes / Pink Eye' },
      { id: 'Headache',                      label: 'Headache' },
      { id: 'Dizziness',                     label: 'Dizziness' },
      { id: 'Bleeding from Body Openings',   label: 'Bleeding from Body Openings' },
      { id: 'Discolored or Bloody Urine',    label: 'Discolored or Bloody Urine' },
      { id: 'Ear Pain',                      label: 'Ear Pain' },
      { id: 'Other',                         label: 'Other' },
    ],
  },
];

// One Health exposure + severity toggles (EpiHack minimum dataset)
const TOGGLES = [
  // Exposure
  { id: 'recent_travel',          label: 'History of travel (past 2 weeks)',           group: 'Exposure' },
  { id: 'event_attendance',       label: 'Attended a mass gathering recently',          group: 'Exposure' },
  { id: 'tick_insect_bite',       label: 'Tick or insect bite',                         group: 'Exposure' },
  { id: 'animal_bite',            label: 'Animal bite',                                 group: 'Exposure' },
  { id: 'animal_contact',         label: 'Contact with live animals / livestock',        group: 'Exposure' },
  { id: 'contact_sick_individual',label: 'Contact with sick person / confirmed case',    group: 'Exposure' },
  // Severity / Healthcare
  { id: 'absent_from_work',       label: 'Absent from work due to illness',             group: 'Severity' },
  { id: 'absent_from_school',     label: 'Absent from school due to illness',           group: 'Severity' },
  { id: 'sought_healthcare',      label: 'Sought healthcare or treatment',              group: 'Severity' },
  { id: 'reporting_to_authority', label: 'Reporting to a health authority',             group: 'Severity' },
  // Environmental
  { id: 'water_concerns',         label: 'Water source concerns or contamination',       group: 'Environmental' },
  { id: 'flooding',               label: 'Flooding in your area recently',              group: 'Environmental' },
];

export default function SymptomForm({ setView, setResults, setFormData }) {
  const [symptoms, setSymptoms] = useState([]);
  const [selectedCounty, setSelectedCounty] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cp_county') || 'null'); } catch { return null; }
  });
  const [ageGroup, setAgeGroup] = useState(localStorage.getItem('cp_age_group') || 'adult');
  const [sex, setSex] = useState('');
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
    if (!selectedCounty?.fips) { setError('Please select your county.'); return; }
    if (symptoms.length === 0) { setError('Please select at least one symptom that applies.'); return; }

    setError('');
    setLoading(true);

    // Cache user preferences
    localStorage.setItem('cp_county', JSON.stringify(selectedCounty));
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
      fips: selectedCounty.fips,
      county: selectedCounty.county,
      state: selectedCounty.state,
      age_group: ageGroup,
      sex: sex || null,
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
        {SYMPTOM_CATEGORIES.map(cat => (
          <div key={cat.label} style={{ marginBottom: 16 }}>
            <div style={{
              color: '#6B7280', fontSize: '0.72rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.8,
              marginBottom: 8,
            }}>
              {cat.label}
            </div>
            <div className="symptom-grid">
              {cat.symptoms.map(s => (
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
        ))}
      </div>

      {/* Location & Demographics */}
      <div className="form-section">
        <h3>About You</h3>
        <div className="form-row">
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">County</label>
            <CountyPicker value={selectedCounty} onChange={setSelectedCounty} />
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
            <label className="form-label">Sex</label>
            <select
              className="form-input"
              value={sex}
              onChange={e => setSex(e.target.value)}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
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
        </div>
        <div className="form-row">
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

      {/* One Health Exposure, Severity & Environmental */}
      <div className="form-section">
        <h3>One Health Factors</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 14 }}>
          These factors help identify outbreak sources. All answers are anonymous.
        </p>
        {['Exposure', 'Severity', 'Environmental'].map(group => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{
              color: '#6B7280', fontSize: '0.7rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
            }}>
              {group}
            </div>
            <div className="toggle-list">
              {TOGGLES.filter(t => t.group === group).map(t => (
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
        ))}
      </div>

      {error && (
        <div style={{ color: 'var(--red)', fontSize: '0.875rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={loading}>
        Analyze My Risk →
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: '#9CA3AF', fontSize: '0.73rem' }}>
        <span>🔒</span>
        <span>Anonymous by default · County-level only · No data sold · AI runs locally</span>
      </div>
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
