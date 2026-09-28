/**
 * Hand-built SVG chart primitives with a notebook/journal feel:
 * soft rounded shapes, slightly thick strokes, muted fills, no gridlines.
 * No chart library — everything is local and tiny. Animations respect
 * the user's reduced-motion preference.
 */
import { useState } from 'react';
import { useI18n } from '../../i18n';

export const LAYER_COLORS = {
  new: '#d9a13c', // mustard
  learning: '#c96f4a', // terracotta
  review: '#4a7bb5', // dusty blue
  mastered: '#5f9d5f', // sage green — the rewarding one
  recognized: '#9c8d7c', // faint ink for the recognized band
};

function useReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------- stacked area ("word garden") ----------

export interface GardenLayer {
  key: keyof typeof LAYER_COLORS;
  /** One value per x-point; null = no data (chart breaks the line). */
  values: (number | null)[];
}

export function StackedArea({
  layers,
  dates,
  height = 180,
}: {
  layers: GardenLayer[];
  dates: string[];
  height?: number;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const PAD_L = 34;
  const PAD_R = 8;
  const PAD_T = 10;
  const PAD_B = 22;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const totals = dates.map((_, i) => layers.reduce((s, l) => s + (l.values[i] ?? 0), 0));
  const maxTotal = Math.max(4, ...totals);
  const n = dates.length;
  const x = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  // cumulative tops per layer
  const cum: number[][] = [];
  let running = dates.map(() => 0);
  for (const layer of layers) {
    running = running.map((v, i) => v + (layer.values[i] ?? 0));
    cum.push([...running]);
  }

  const y = (v: number) => PAD_T + plotH - (v / maxTotal) * plotH;

  const areaPath = (upper: number[], lower: number[] | null) => {
    if (upper.length === 0) return '';
    let d = `M ${x(0)} ${y(lower ? (lower[0] ?? 0) : 0)}`;
    for (let i = 0; i < upper.length; i++) d += ` L ${x(i)} ${y(upper[i])}`;
    if (lower) {
      for (let i = upper.length - 1; i >= 0; i--) d += ` L ${x(i)} ${y(lower[i] ?? 0)}`;
    } else {
      d += ` L ${x(upper.length - 1)} ${y(0)} L ${x(0)} ${y(0)}`;
    }
    return d + ' Z';
  };

  const shortDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  return (
    <div className="garden-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('garden.title')}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHover(null)}
      >
        {/* baseline */}
        <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="var(--line)" strokeWidth={1.6} />
        {/* stacked areas bottom-up: mastered first so it sits at the bottom, dominant */}
        {layers
          .slice()
          .reverse()
          .map((layer, idx) => {
            const layerIdx = layers.length - 1 - idx;
            const upper = cum[layerIdx];
            const lower = layerIdx === 0 ? null : cum[layerIdx - 1];
            return (
              <path
                key={layer.key}
                d={areaPath(upper, lower)}
                fill={LAYER_COLORS[layer.key]}
                opacity={layer.key === 'mastered' ? 0.85 : 0.55}
                stroke={LAYER_COLORS[layer.key]}
                strokeWidth={1.8}
                className={reduced ? '' : 'chart-area'}
              />
            );
          })}
        {/* hover guide + touch targets */}
        {dates.map((d, i) => (
          <rect
            key={d}
            x={x(i) - plotW / Math.max(n, 1) / 2}
            y={PAD_T}
            width={plotW / Math.max(n, 1)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} y1={PAD_T} x2={x(hover)} y2={PAD_T + plotH} stroke="var(--ink-soft)" strokeWidth={1} strokeDasharray="3 4" />
            {layers.map((layer, li) => {
              const v = layer.values[hover];
              if (!v) return null;
              return <circle key={layer.key} cx={x(hover)} cy={y(cum[li][hover])} r={3} fill={LAYER_COLORS[layer.key]} />;
            })}
          </g>
        )}
        {/* x labels: ~6 evenly spaced */}
        {dates.length > 1 &&
          [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => {
            const i = Math.round(f * (dates.length - 1));
            return (
              <text key={f} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--ink-faint)">
                {shortDate(dates[i])}
              </text>
            );
          })}
        {/* y labels */}
        {[0.5, 1].map((f) => (
          <text key={f} x={PAD_L - 6} y={y(maxTotal * f) + 3} textAnchor="end" fontSize={10} fill="var(--ink-faint)">
            {Math.round(maxTotal * f)}
          </text>
        ))}
      </svg>
      {hover != null && (
        <div className="garden-tooltip" role="status">
          <strong>{new Date(dates[hover] + 'T00:00:00').toLocaleDateString()}</strong>
          {layers.map((l) => (
            <span key={l.key}>
              <i className="garden-dot" style={{ background: LAYER_COLORS[l.key] }} />
              {t(`garden.${l.key}`)}: <b dir="ltr">{l.values[hover] ?? 0}</b>
            </span>
          ))}
          <span>
            {t('garden.total')}: <b dir="ltr">{totals[hover]}</b>
          </span>
        </div>
      )}
      <div className="garden-legend">
        {layers.map((l) => (
          <span key={l.key}>
            <i className="garden-dot" style={{ background: LAYER_COLORS[l.key] }} />
            {t(`garden.${l.key}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- goal ring ----------

export function GoalRing({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) {
  const reduced = useReducedMotion();
  const size = 120;
  const stroke = 11;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const complete = max > 0 && value >= max;
  return (
    <div className="goal-ring" role="img" aria-label={`${label}: ${value} / ${max}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} opacity={0.6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={complete ? 'var(--green)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={reduced ? '' : 'ring-anim'}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={26} fill="var(--ink)" fontFamily="var(--font-hand)" fontWeight={700}>
          {value}
        </text>
        <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fontSize={11} fill="var(--ink-faint)">
          / {max}
        </text>
      </svg>
      <div className="goal-ring-label">
        <strong>{label}</strong>
        {sub && <span className="faint">{sub}</span>}
      </div>
    </div>
  );
}

// ---------- skill bars ----------

export function SkillBarRow({ label, hint, value, display, samples, unit }: {
  label: string;
  hint?: string;
  value?: number;
  display?: number;
  samples: number;
  unit: 'percent' | 'per10';
}) {
  const reduced = useReducedMotion();
  const { t } = useI18n();
  const enough = value != null;
  return (
    <div className="skill-row">
      <div className="skill-head">
        <span className="skill-name">{label}</span>
        <span className="skill-value" dir="ltr">
          {enough ? (
            unit === 'percent' ? `${display}%` : `${display}/10`
          ) : (
            <em className="skill-nodata">— {hint ?? ''}</em>
          )}
        </span>
      </div>
      <div
        className={`skill-track ${enough ? '' : 'skill-track-dashed'}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={enough ? Math.round((value ?? 0) * 100) : undefined}
        aria-label={`${label}: ${enough ? `${display}${unit === 'percent' ? '%' : '/10'}` : 'not enough data'}`}
        title={`${label} — ${samples} samples`}
      >
        {enough && (
          <i
            className={`skill-fill ${reduced ? '' : 'skill-fill-anim'}`}
            style={{ width: `${Math.max(3, (value ?? 0) * 100)}%` }}
          />
        )}
      </div>
      {!enough && (
        <span className="skill-samples faint">{t('skills.samples', { n: samples })}</span>
      )}
    </div>
  );
}

// ---------- heatmap ----------

export function Heatmap({ cells }: { cells: { date: string; level: 0 | 1 | 2 | 3 }[] }) {
  const { t } = useI18n();
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="img" aria-label={t('consistency.month')}>
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-col">
            {week.map((c) => (
              <span
                key={c.date}
                className={`heat-cell heat-${c.level}`}
                title={new Date(c.date + 'T00:00:00').toLocaleDateString()}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-scale">
        <span className="faint">{t('consistency.less')}</span>
        <i className="heat-cell heat-0" />
        <i className="heat-cell heat-3" />
        <span className="faint">{t('consistency.more')}</span>
      </div>
    </div>
  );
}
