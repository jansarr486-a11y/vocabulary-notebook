import { LEVEL_TAG_STYLES, LEVEL_TAGS, type LevelTag } from '../../db/models';
import { IconMastered } from './icons';
import { useI18n } from '../../i18n';

export function LevelChips({
  selected,
  onToggle,
}: {
  selected: LevelTag[];
  onToggle: (tag: LevelTag) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="chip-row" role="group" aria-label={t('form.levelsAria')}>
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
const DOT_TITLE_KEY: Record<string, string> = {
  overdue: 'dot.overdue',
  due: 'dot.due',
  done: 'dot.done',
  locked: 'dot.locked',
  optional: 'dot.optional',
};

export function StateDot({ state }: { state: string }) {
  const { t } = useI18n();
  const label = DOT_TITLE_KEY[state] ? t(DOT_TITLE_KEY[state]) : state;
  return (
    <span
      className={`dot ${STATE_CLASS[state] ?? 'dot-locked'}`}
      data-glyph={DOT_GLYPH[state] ?? ''}
      title={label}
      aria-label={label}
    />
  );
}

const BADGE_LABEL_KEY: Record<string, string> = {
  overdue: 'state.overdue',
  due: 'state.due',
  done: 'state.done',
  locked: 'state.locked',
  optional: 'state.optional',
};

export function StateBadge({ state }: { state: string }) {
  const { t } = useI18n();
  return (
    <span className={`badge-state badge-${state}`}>
      {state === 'done' && <IconMastered className="badge-icon" />}
      {BADGE_LABEL_KEY[state] ? t(BADGE_LABEL_KEY[state]) : state}
    </span>
  );
}
