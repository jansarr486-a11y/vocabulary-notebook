import { LEVEL_TAG_STYLES, LEVEL_TAGS, type LevelTag } from '../../db/models';

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

export function StateDot({ state }: { state: string }) {
  return <span className={`dot ${STATE_CLASS[state] ?? 'dot-locked'}`} aria-hidden />;
}

const BADGE_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  due: 'Due today',
  done: 'Done',
  locked: 'Locked',
  optional: 'Optional',
};

export function StateBadge({ state }: { state: string }) {
  return <span className={`badge-state badge-${state}`}>{BADGE_LABEL[state] ?? state}</span>;
}
