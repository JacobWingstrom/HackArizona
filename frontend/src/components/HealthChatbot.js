import React, { useState, useEffect, useRef } from 'react';
import { sendChatMessage } from '../api';

const GREETING = `I'm your public health information assistant — not a medical provider.

I can help with:
• Public health guidelines for your situation
• How to protect your household and community
• When to seek care (from a public health perspective)
• Local and national health resources

What would you like to know?`;

const INSURANCE_LABELS = {
  privately_insured: 'Privately insured',
  medicaid: 'Medicaid / Medicare',
  uninsured: 'Uninsured',
  low_income: 'Low income / sliding-scale',
  public_assistance: 'Other public assistance',
};

function buildContext(formData, results) {
  const parts = [];

  // County/state always first — drives local resource lookup
  const county = formData?.county || results?.county;
  const state = formData?.state || results?.state;
  if (county || state) {
    parts.push(`Location: ${county ? county + ' County' : ''}${state ? (county ? ', ' : '') + state : ''}`);
    if (county && state) {
      parts.push(`Local health department search: "${county} County Health Department ${state}"`);
    }
  }

  if (formData?.feeling === 'sick' || formData?.feeling === 'healthy') {
    parts.push(`User reported feeling: ${formData.feeling}`);
  }
  if (formData?.symptoms?.length > 0) {
    parts.push(`Symptoms: ${formData.symptoms.join(', ')}`);
  }
  if (formData?.age_group) {
    parts.push(`Age group: ${formData.age_group}`);
  }
  if (formData?.household_members) {
    parts.push(`Household: ${formData.household_members} members, ${formData.sick_household_members || 0} sick`);
  }

  if (formData?.insurance_status && formData.insurance_status !== 'prefer_not_to_say') {
    const label = INSURANCE_LABELS[formData.insurance_status] || formData.insurance_status;
    parts.push(`Insurance / coverage status: ${label}`);
    if (formData.insurance_status === 'uninsured' || formData.insurance_status === 'low_income') {
      parts.push('Note: User is uninsured or low-income — prioritize free clinics, FQHCs, sliding-scale resources, and 211.');
    } else if (formData.insurance_status === 'medicaid' || formData.insurance_status === 'public_assistance') {
      parts.push('Note: User has Medicaid/public assistance — recommend community health centers and FQHC options that accept Medicaid.');
    }
  }

  if (results?.risk_level) {
    parts.push(`Community risk level: ${results.risk_level}`);
  }
  if (results?.cluster?.report_count != null) {
    parts.push(`Reports in county (72h): ${results.cluster.report_count}`);
  }
  if (results?.cluster?.trend_pct != null) {
    const t = results.cluster.trend_pct;
    parts.push(`County illness trend: ${t > 0 ? '+' : ''}${t}%`);
  }

  const exposures = [];
  if (formData?.recent_travel)          exposures.push('recent travel');
  if (formData?.event_attendance)       exposures.push('mass gathering');
  if (formData?.tick_insect_bite)       exposures.push('tick/insect bite');
  if (formData?.animal_bite)            exposures.push('animal bite');
  if (formData?.contact_sick_individual)exposures.push('contact with sick person');
  if (formData?.flooding)               exposures.push('local flooding');
  if (formData?.water_concerns)         exposures.push('water source concerns');
  if (exposures.length > 0) {
    parts.push(`Exposure flags: ${exposures.join(', ')}`);
  }

  if (formData?.additional_comments) {
    parts.push(`User's additional comments: "${formData.additional_comments}"`);
  }
  if (results?.recommendation) {
    parts.push(`System recommendation: ${results.recommendation.slice(0, 200)}`);
  }

  return parts.join('\n') || 'No form data available.';
}

export default function HealthChatbot({ onClose, formData, results }) {
  const sessionKey = `cp_chat_${results?.fips || formData?.fips || 'general'}_${new Date().toDateString()}`;

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(sessionKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [{ role: 'assistant', content: GREETING }];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(sessionKey, JSON.stringify(messages.slice(-60)));
    } catch {}
  }, [messages, sessionKey]);

  // Focus trap + initial focus
  useEffect(() => {
    const panel = document.getElementById('health-chatbot-panel');
    if (!panel) return;
    inputRef.current?.focus();
    const handleKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = panel.querySelectorAll(
        'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    panel.addEventListener('keydown', handleKey);
    return () => panel.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    const context = buildContext(formData, results);
    try {
      const data = await sendChatMessage(text, nextMessages.slice(1), context);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I had trouble connecting. For public health resources, visit cdc.gov or call 1-800-CDC-INFO.',
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.25)',
          zIndex: 1000,
        }}
      />

      {/* Panel */}
      <div
        id="health-chatbot-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chatbot-title"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: 440,
          background: '#FFFFFF',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.13)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
        }}
      >

        {/* Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
            border: '1px solid #BFDBFE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', flexShrink: 0,
          }}>
            💬
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="chatbot-title" style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1F2937' }}>
              Public Health Assistant
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2,
              background: '#FEF9C3', border: '1px solid #FDE68A',
              borderRadius: 10, padding: '1px 7px',
              fontSize: '0.6rem', fontWeight: 700, color: '#92400E',
              letterSpacing: 0.3,
            }}>
              ℹ Not medical advice
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close public health assistant"
            style={{
              background: 'none', border: 'none', color: '#9CA3AF',
              fontSize: '1.2rem', cursor: 'pointer', padding: 4,
              lineHeight: 1, flexShrink: 0,
              borderRadius: 6,
              transition: 'color 0.13s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#374151'}
            onMouseLeave={e => e.currentTarget.style.color = '#9CA3AF'}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Messages */}
        <div
          aria-live="polite"
          aria-label="Conversation"
          style={{
            flex: 1, overflowY: 'auto',
            padding: '16px 18px',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '82%',
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, #2C5282, #3B82F6)'
                  : '#F3F4F6',
                color: msg.role === 'user' ? '#FFFFFF' : '#1F2937',
                borderRadius: msg.role === 'user'
                  ? '16px 16px 4px 16px'
                  : '16px 16px 16px 4px',
                padding: '10px 14px',
                fontSize: '0.84rem',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div role="status" aria-label="Assistant is typing" style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                background: '#F3F4F6', borderRadius: '16px 16px 16px 4px',
                padding: '10px 16px', display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#9CA3AF',
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '12px 14px',
          borderTop: '1px solid #E5E7EB',
          display: 'flex', gap: 10, alignItems: 'flex-end',
          flexShrink: 0,
          background: '#FAFAFA',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about prevention, resources, what to do next..."
            disabled={loading}
            rows={1}
            style={{
              flex: 1,
              border: '1.5px solid #E5E7EB',
              borderRadius: 10,
              padding: '9px 12px',
              fontSize: '0.84rem',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              background: '#FFFFFF',
              color: '#1F2937',
              lineHeight: 1.4,
              maxHeight: 100,
              overflowY: 'auto',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#2C5282'}
            onBlur={e => e.target.style.borderColor = '#E5E7EB'}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            aria-label="Send message"
            style={{
              background: loading || !input.trim() ? '#E5E7EB' : '#2C5282',
              border: 'none', borderRadius: 10,
              width: 38, height: 38,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: loading || !input.trim() ? 'default' : 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={loading || !input.trim() ? '#9CA3AF' : '#FFFFFF'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

        {/* Footer disclaimer */}
        <div style={{
          padding: '6px 14px 10px',
          fontSize: '0.6rem', color: '#9CA3AF', textAlign: 'center',
          flexShrink: 0,
        }}>
          For emergencies call 911 · For health advice consult a licensed provider
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </>
  );
}
