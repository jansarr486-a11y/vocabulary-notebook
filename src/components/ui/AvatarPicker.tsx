import { useRef, useState } from 'react';
import { useObjectUrl } from '../../hooks/useMisc';
import { downscaleAvatar, rotateBlob } from '../../utils/image';

interface Props {
  /** Current picture, if any. */
  blob?: Blob;
  /** Accent colour shown behind the initial when no picture is set. */
  accent: string;
  name: string;
  /** Called with the processed square blob, or undefined when clearing. */
  onChange: (avatar: { blob: Blob; mime: string } | undefined) => void;
  size?: number;
}

/**
 * Profile-picture picker: circular preview with choose / rotate / zoom /
 * remove. New files are center-cropped square before they reach the caller;
 * Rotate turns the picture 90°, Zoom fills the circle tighter (2× shows only
 * the middle half). Zoom remembers its level per picture until changed.
 */
export function AvatarPicker({ blob, accent, name, onChange, size = 72 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [localBlob, setLocalBlob] = useState<Blob | undefined>(undefined);
  /** Source file backing the current crop — kept so Zoom can re-crop losslessly. */
  const sourceRef = useRef<Blob | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const shown = localBlob ?? (removing ? undefined : blob);
  const url = useObjectUrl(shown);
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  const pick = async (file: File) => {
    try {
      setBusy(true);
      sourceRef.current = file;
      setZoom(1);
      const { blob: b, mime } = await downscaleAvatar(file);
      setRemoving(false);
      setLocalBlob(undefined);
      onChange({ blob: b, mime });
    } catch {
      // non-image or undecodable file — ignore silently, like word pictures
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (quarters: number) => {
    const current = localBlob ?? blob;
    if (!current || busy) return;
    try {
      setBusy(true);
      const { blob: b, mime } = await rotateBlob(current, quarters);
      setLocalBlob(b);
      sourceRef.current = undefined;
      setZoom(1);
      onChange({ blob: b, mime });
    } catch {
      // ignore — keep the current picture
    } finally {
      setBusy(false);
    }
  };

  const applyZoom = async (next: number) => {
    const source = sourceRef.current ?? localBlob ?? blob;
    if (!source || busy) return;
    const z = Math.min(3, Math.max(1, Math.round(next * 10) / 10));
    try {
      setBusy(true);
      const { blob: b, mime } = await downscaleAvatar(source, 256, 0.85, z);
      setLocalBlob(b);
      setZoom(z);
      onChange({ blob: b, mime });
    } catch {
      // ignore — keep the current picture
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avatar-picker" style={{ width: size }}>
      <button
        type="button"
        className="avatar-btn avatar-preview"
        style={{ background: url ? 'var(--paper-deep)' : accent, width: size, height: size }}
        disabled={busy}
        title={url ? 'Change picture' : 'Add a picture'}
        aria-label={url ? 'Change profile picture' : 'Add profile picture'}
        onClick={() => fileRef.current?.click()}
      >
        {url ? <img src={url} alt="" /> : initial}
      </button>
      {url && (
        <label className="avatar-zoom" title="Zoom the picture to fill the circle">
          <span className="faint">−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            aria-label="Zoom picture"
            disabled={busy}
            onChange={(e) => void applyZoom(Number(e.target.value))}
          />
          <span className="faint">+</span>
        </label>
      )}
      <div className="avatar-picker-actions">
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {url ? 'Change' : 'Choose photo'}
        </button>
        {url && (
          <>
            <button
              type="button"
              className="btn btn-sm"
              title="Turn the picture 90° counter-clockwise"
              aria-label="Rotate picture counter-clockwise"
              disabled={busy}
              onClick={() => void rotate(-1)}
            >
              ⟲
            </button>
            <button
              type="button"
              className="btn btn-sm"
              title="Turn the picture 90° clockwise"
              aria-label="Rotate picture clockwise"
              disabled={busy}
              onClick={() => void rotate(1)}
            >
              ⟳
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setRemoving(true);
                setLocalBlob(undefined);
                setZoom(1);
                onChange(undefined);
              }}
            >
              Remove
            </button>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
