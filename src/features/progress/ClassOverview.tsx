/**
 * Tutor mode class overview (Part 4) — imports student JSON reports and shows
 * a need-for-attention table plus class-wide struggle words. 100% local.
 */
import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { clearTutorReports, importTutorReports } from '../../db/progressRepo';
import { buildClassOverview, classStruggleWords } from '../../db/progress';
import { hashPin } from '../../db/pin';
import { useI18n, Ltr } from '../../i18n';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import type { TutorReport } from '../../db/models';

const TUTOR_PIN_KEY = 'tutorPinHash';
const TUTOR_SALT_KEY = 'tutorPinSalt';
const TUTOR_ENABLED_KEY = 'tutorModeEnabled';

export function tutorModeEnabled(): Promise<boolean> {
  return db.meta.get(TUTOR_ENABLED_KEY).then((r) => r?.value === true);
}

export function setTutorModeEnabled(on: boolean): Promise<void> {
  return db.meta.put({ key: TUTOR_ENABLED_KEY, value: on }).then(() => undefined);
}

export async function getTutorPin(): Promise<{ hash?: string; salt?: string }> {
  const [hash, salt] = await Promise.all([db.meta.get(TUTOR_PIN_KEY), db.meta.get(TUTOR_SALT_KEY)]);
  return { hash: hash?.value as string | undefined, salt: salt?.value as string | undefined };
}

export async function setTutorPin(pin?: string): Promise<void> {
  if (!pin) {
    await db.meta.bulkPut([
      { key: TUTOR_PIN_KEY, value: undefined },
      { key: TUTOR_SALT_KEY, value: undefined },
    ]);
    return;
  }
  const { pinHash, pinSalt } = await hashPin(pin);
  await db.meta.bulkPut([
    { key: TUTOR_PIN_KEY, value: pinHash },
    { key: TUTOR_SALT_KEY, value: pinSalt },
  ]);
}

export function ClassOverview() {
  const { t } = useI18n();
  const { toast } = useToast();
  const reports = useLiveQuery(() => db.tutorReports.orderBy('importedAt').toArray(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const rows = useMemo(() => buildClassOverview((reports ?? []).map((r: TutorReport) => r.report)), [reports]);
  const struggles = useMemo(() => classStruggleWords(rows), [rows]);

  const onFiles = async (files: FileList) => {
    const parsed: Parameters<typeof importTutorReports>[0] = [];
    let bad = 0;
    for (const f of Array.from(files)) {
      const r = parseSafe(await f.text());
      if (r) parsed.push(r);
      else bad++;
    }
    if (parsed.length > 0) {
      await importTutorReports(parsed);
      toast(t('tutor.imported', { n: parsed.length }));
    }
    if (bad > 0) toast(t('tutor.fileError'));
  };

  return (
    <div className="class-overview">
      <div className="paper-card washi class-actions">
        <p className="muted small">{t('tutor.desc')}</p>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>📥 {t('tutor.import')}</button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmClear(true)}>🗑 {t('tutor.clear')}</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void onFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {(reports ?? []).length === 0 ? (
        <div className="empty-state">
          <span className="doodle">📋</span>
          <h3>{t('tutor.title')}</h3>
          <p>{t('tutor.empty')}</p>
        </div>
      ) : (
        <>
          <div className="paper-card washi">
            <h3>
              {t('tutor.table.student')} · <Ltr>{t('tutor.students', { n: rows.length })}</Ltr>
            </h3>
            <div className="class-table-wrap">
              <table className="class-table">
                <thead>
                  <tr>
                    <th>{t('tutor.table.student')}</th>
                    <th>{t('tutor.table.active')}</th>
                    <th>{t('tutor.table.mastered')}</th>
                    <th>{t('tutor.table.accuracy')}</th>
                    <th>{t('tutor.table.trend')}</th>
                    <th>{t('tutor.table.goal')}</th>
                    <th>{t('tutor.table.sent')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td><strong>{r.name}</strong></td>
                      <td><Ltr>{r.activeDays}/7</Ltr></td>
                      <td><Ltr>{r.mastered}</Ltr></td>
                      <td>
                        <Ltr>{r.reviewAccuracy != null ? `${Math.round(r.reviewAccuracy * 100)}%` : t('report.notEnough')}</Ltr>
                      </td>
                      <td>
                        <span className={`trend trend-${r.trend}`} aria-label={t(`tutor.trend.${r.trend}`)}>
                          {r.trend === 'up' ? '▲' : r.trend === 'down' ? '▼' : '▬'} {t(`tutor.trend.${r.trend}`)}
                        </span>
                      </td>
                      <td>
                        <span className={r.goalCompleted ? 'goal-ok' : 'goal-pending'}>
                          {r.goalCompleted ? `✓ ${t('tutor.goal.done')}` : t('tutor.goal.notYet')}
                        </span>
                      </td>
                      <td className="faint">{new Date(r.sentAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="paper-card washi">
            <h3>{t('tutor.struggle.title')}</h3>
            <p className="muted small">{t('tutor.struggle.desc', { n: 3 })}</p>
            {struggles.length === 0 ? (
              <p className="muted small">{t('tutor.struggle.empty')}</p>
            ) : (
              <div className="chip-row">
                {struggles.map((s) => (
                  <span key={s.word} className="chip struggle-chip">
                    <Ltr>
                      {s.word} ×{s.students}
                    </Ltr>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {confirmClear && (
        <Modal
          title={t('tutor.clear')}
          onClose={() => setConfirmClear(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmClear(false)}>{t('common.cancel')}</button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await clearTutorReports();
                  setConfirmClear(false);
                }}
              >
                {t('common.delete')}
              </button>
            </>
          }
        >
          <p>{t('tutor.clear.confirm')}</p>
        </Modal>
      )}
    </div>
  );
}

function parseSafe(text: string) {
  try {
    const data = JSON.parse(text);
    if (data?.app !== 'vocabulary-notebook-progress' || typeof data.studentName !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}
