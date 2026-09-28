import { useState } from 'react';
import { useTTS } from '../../hooks/useTTS';
import { IconSpeaker } from './icons';

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
      <IconSpeaker />
    </button>
  );
}
