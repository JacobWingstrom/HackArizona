import React, { useEffect, useState } from 'react';
import { submitCheckin } from '../api';

function updateStreak() {
  const today = new Date().toDateString();
  const last = localStorage.getItem('cp_last_checkin');
  let streak = parseInt(localStorage.getItem('cp_streak') || '0');
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (last === today) return streak;
  if (last === yesterday) {
    streak += 1;
  } else {
    streak = 1;
  }
  localStorage.setItem('cp_streak', streak);
  localStorage.setItem('cp_last_checkin', today);
  return streak;
}

const CAMPAIGN_MESSAGES = {
  child: {
    title: "Protecting the next generation!",
    sub: "Share CommunityPulse with your child's school to keep classrooms safe.",
  },
  elderly: {
    title: "Your community thanks you.",
    sub: "Daily check-ins from experienced community members make our data stronger.",
  },
  adult: {
    title: "Help keep campus and community healthy.",
    sub: "Share CommunityPulse with friends and coworkers to build better outbreak coverage.",
  },
};

export default function WellnessMode({ setView, currentUser, setCurrentUser }) {
  const [streak, setStreak] = useState(0);
  const [wellnessTip, setWellnessTip] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const ageGroup = localStorage.getItem('cp_age_group') || 'adult';
  const campaign = CAMPAIGN_MESSAGES[ageGroup] || CAMPAIGN_MESSAGES.adult;

  useEffect(() => {
    const localStreak = updateStreak();
    setStreak(localStreak);

    submitCheckin({
      feeling: 'healthy',
      symptoms: [],
      zip_code: localStorage.getItem('cp_zip') || '85721',
      age_group: ageGroup,
      household_members: 1,
      sick_household_members: 0,
    })
      .then((res) => {
        setWellnessTip(res.wellness_tip || '');
        setSubmitted(true);
        if (res.server_streak != null && currentUser && setCurrentUser) {
          setStreak(res.server_streak);
          setCurrentUser(u => ({ ...u, streak: res.server_streak }));
          localStorage.setItem('cp_streak', res.server_streak);
        }
      })
      .catch(() => setSubmitted(true));
  }, [ageGroup]); // eslint-disable-line

  return (
    <div className="wellness-screen">
      <div className="wellness-icon">✨</div>
      <h2 className="wellness-title">Feeling great!</h2>
      <p className="wellness-sub">Your check-in is recorded. Thank you for contributing.</p>

      <div className="streak-display">
        <div className="streak-number">🔥 {streak}</div>
        <div className="streak-label">day streak — you're on a roll!</div>
      </div>

      <div className="community-badge">
        <strong>You're part of the CommunityPulse network.</strong>
        <br />
        Every healthy check-in helps us establish baselines that make outbreak detection more accurate.
      </div>

      {wellnessTip && (
        <div className="card">
          <div className="section-title">💡 Wellness Tip</div>
          <p className="text-muted">{wellnessTip}</p>
        </div>
      )}

      <div className="card">
        <div className="section-title">{campaign.title}</div>
        <p className="text-muted">{campaign.sub}</p>
      </div>

      <button className="btn btn-secondary mt-16" onClick={() => setView('checkin')}>
        ← Back to Home
      </button>
    </div>
  );
}
