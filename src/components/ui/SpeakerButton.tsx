import { useState } from 'react';
import { useTTS } from '../../hooks/useTTS';

/** Speaker icon that reads the word aloud via the browser's speechSynthesis. */
export function SpeakerButton({ text, small }: { text: string; small?: boolean }) {
  const { speak, speaking, supported } = useTTS();
  const [wiggled, setWiggled] = useState(false);
  if (!supported) return null;
  const active = speaking || wiggled;

  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'speaking' : ''}`}
      style={small ? { width: 36, height: 36, boxShadow: 'none' } : undefined}
      title="Pronounce"
      aria-label={`Pronounce “${text}”`}
      onClick={() => {
        setWiggled(true);
        window.setTimeout(() => setWiggled(false), 700);
        speak(text);
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 010 7" />
        <path d="M18.5 5.5a9.5 9.5 0 010 13" />
      </svg>
    </button>
  );
}
