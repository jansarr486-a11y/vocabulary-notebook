import { LEVEL_TAG_STYLES, LEVEL_TAGS, type LevelTag } from '../../db/models';
import { IconMastered } from './icons';

export function LevelChips({
  selected,
  onToggle,
}: {
  selected: LevelTag[];
  onToggle: (tag: LevelTag) => void;
}) {
  return (
    <div className="chip-row" role="group" aria-label="Level tags">
      {LEVEL_TAGS.map((tag) => {
        const on = selected.includes(tag);
        const style = LEVEL_TAG_STYLES[tag];
        return (
          <button
            key={tag}
            type="button"
            className={`chip ${on ? 'chip-on' : ''}`}
            style={on ? { background: style.bg, color: style.fg } : undefined}
            aria-pressed={on}
            onClick={() => onToggle(tag)}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}

export function LevelBadge({ tag }: { tag: LevelTag }) {
  const style = LEVEL_TAG_STYLES[tag];
  return (
    <span className="chip" style={{ background: style.bg, color: style.fg }}>
      {tag}
    </span>
  );
}

const STATE_CLASS: Record<string, string> = {
  overdue: 'dot-overdue',
  due: 'dot-due',
  done: 'dot-done',
  locked: 'dot-locked',
  optional: 'dot-optional',
};

/**
 * Learning-state indicator.
 *
 * One consistent semantic system across the whole app:
 *   green ✓ = completed / mastered
 *   amber ● = in progress / due now
 *   red   ! = overdue / needs attention
 *   gray  ○ = not started (locked)
 *
 * The glyph is drawn with pseudo-elements (no DOM change) so existing layouts
 * keep working; a tooltip gives the plain-language meaning on hover.
 */
const DOT_GLYPH: Record<string, string> = {
  overdue: '!',
  due: '',
  done: '✓',
  locked: '',
  optional: '',
};
const DOT_TITLE: Record<string, string> = {
  overdue: 'Overdue — needs attention',
  due: 'Due today',
  done: 'Completed',
  locked: 'Not started yet',
  optional: 'Optional',
};

export function StateDot({ state }: { state: string }) {
  return (
    <span
      className={`dot ${STATE_CLASS[state] ?? 'dot-locked'}`}
      data-glyph={DOT_GLYPH[state] ?? ''}
      title={DOT_TITLE[state] ?? state}
      aria-label={DOT_TITLE[state] ?? state}
    />
  );
}

const BADGE_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  due: 'Due today',
  done: 'Done',
  locked: 'Locked',
  optional: 'Optional',
};

export function StateBadge({ state }: { state: string }) {
  return (
    <span className={`badge-state badge-${state}`}>
      {state === 'done' && <IconMastered className="badge-icon" />}
      {BADGE_LABEL[state] ?? state}
    </span>
  );
}
