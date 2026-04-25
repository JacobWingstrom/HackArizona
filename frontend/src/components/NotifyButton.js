import React, { useState } from 'react';

export default function NotifyButton({ message, county }) {
  const [copied, setCopied] = useState(false);

  const text = message ||
    `Hey — CommunityPulse detected a potential illness cluster in ${county || 'your'} County, AZ. Please take precautions and stay safe! Check communitypulse.app for details.`;

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleSMS() {
    window.open(`sms:?body=${encodeURIComponent(text)}`);
  }

  return (
    <div className="notify-box">
      <div className="section-title" style={{ color: 'var(--red)' }}>
        ⚠️ Notify Your Contacts
      </div>
      <p className="text-muted" style={{ marginBottom: 12, fontSize: '0.85rem' }}>
        A cluster is forming in your area. Consider alerting people you've been in close contact with.
      </p>
      <div className="notify-message">{text}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-notify btn-sm" onClick={handleSMS}>
          📱 Send via SMS
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
      </div>
    </div>
  );
}
