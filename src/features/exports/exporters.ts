import { exportBackup, listWords } from '../../db/repo';
import { LEVEL_TAG_STYLES, type LevelTag, type Profile, type Word } from '../../db/models';
import { dueState } from '../../db/time';
import { blobToDataUrl } from '../../utils/image';

const INK: [number, number, number] = [59, 49, 40];
const SOFT: [number, number, number] = [107, 93, 79];
const LINE: [number, number, number] = [222, 210, 192];

const SECTION_NAMES = ['Dictionary definition', 'Dictionary example', 'Your own sentence', 'Notes / mnemonics'];

/** Styled PDF: cover page + one card per word, alphabetically sorted. */
export async function exportPdf(profile: Profile): Promise<void> {
  const words = (await listWords(profile.id!)).sort((a, b) => a.wordLower.localeCompare(b.wordLower));
  // Lazy-loaded: only fetched when the student actually exports a PDF.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 48;
  const contentW = pageW - M * 2;

  // ---------- cover ----------
  doc.setFillColor(profile.accentColor || '#c96f4a');
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(255, 253, 247);
  doc.roundedRect(M, 210, contentW, 320, 18, 18, 'F');

  doc.setTextColor(255, 253, 247);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('VOCABULARY NOTEBOOK', pageW / 2, 120, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('a personal collection of English words', pageW / 2, 142, { align: 'center' });

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(42);
  doc.text(profile.name, pageW / 2, 320, { align: 'center' });

  const terms = Array.from(new Set(words.map((w) => w.courseTag).filter(Boolean))) as string[];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...SOFT);
  let coverY = 360;
  if (terms.length > 0) {
    doc.text(terms.join('  ·  '), pageW / 2, coverY, { align: 'center' });
    coverY += 26;
  }
  doc.text(`${words.length} word${words.length === 1 ? '' : 's'}`, pageW / 2, coverY, { align: 'center' });
  doc.setFontSize(11);
  doc.text(
    new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    pageW / 2,
    coverY + 60,
    { align: 'center' },
  );
  doc.setFontSize(9);
  doc.setTextColor(255, 253, 247);
  doc.text('Made offline with Vocabulary Notebook', pageW / 2, pageH - 40, { align: 'center' });

  // ---------- word pages ----------
  let y = 0;

  const newPage = () => {
    doc.addPage();
    y = M;
  };
  const ensure = (needed: number) => {
    if (y + needed > pageH - M) newPage();
  };

  for (const w of words) {
    newPage();

    // word title + phonetic + POS
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...INK);
    doc.text(w.word, M, y + 24);
    let headerW = doc.getTextWidth(w.word) + M + 12;

    if (w.phonetic) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(13);
      doc.setTextColor(...SOFT);
      doc.text(w.phonetic, headerW, y + 24);
      headerW += doc.getTextWidth(w.phonetic) + 12;
    }
    if (w.partOfSpeech) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(11);
      doc.text(w.partOfSpeech, headerW, y + 24);
    }
    y += 40;

    // level tag chips
    let chipX = M;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    for (const tag of w.levelTags as LevelTag[]) {
      const style = LEVEL_TAG_STYLES[tag];
      const tw = doc.getTextWidth(tag) + 12;
      doc.setFillColor(style.bg);
      doc.roundedRect(chipX, y, tw, 15, 7, 7, 'F');
      doc.setTextColor(style.fg);
      doc.text(tag, chipX + 6, y + 10.5);
      chipX += tw + 6;
    }
    if (w.courseTag) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...SOFT);
      doc.text(w.courseTag, chipX + 6, y + 11);
    }
    y += 26;

    // image
    if (w.imageBlob) {
      try {
        const dataUrl = await blobToDataUrl(w.imageBlob);
        const fmt = w.imageMime?.includes('png') ? 'PNG' : 'JPEG';
        const props = doc.getImageProperties(dataUrl);
        const maxW = 190;
        const maxH = 140;
        const scale = Math.min(maxW / props.width, maxH / props.height);
        doc.addImage(dataUrl, fmt, pageW - M - props.width * scale, y - 14, props.width * scale, props.height * scale);
      } catch {
        // unreadable image — skip it in the PDF
      }
    }

    // sections
    y += 6;
    for (let i = 1; i <= 4; i++) {
      const s = w.sections[i - 1];
      const hasText = !!s?.text;
      ensure(46);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...SOFT);
      const doneInfo = s?.completedAt ? `   (${new Date(s.completedAt).toLocaleDateString()})` : '   (empty)';
      doc.text(`${i}. ${SECTION_NAMES[i - 1]}${hasText ? doneInfo : ''}`, M, y + 12);
      y += 18;
      if (hasText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11.5);
        doc.setTextColor(...INK);
        const lines = doc.splitTextToSize(s.text, contentW - 24) as string[];
        ensure(lines.length * 15 + 8);
        doc.text(lines, M + 14, y + 12);
        y += lines.length * 15 + 6;
      }
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.7);
      doc.line(M + 14, y + 4, pageW - M, y + 4);
      y += 14;
    }

    // due status footnote
    const now = Date.now();
    const states = [1, 2, 3, 4].map((i) => dueState(w.sections[i - 1]?.unlockedAt, w.sections[i - 1]?.completedAt, now));
    const remaining = states.filter((s) => s !== 'done').length;
    ensure(24);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...SOFT);
    doc.text(
      remaining === 0 ? 'Word complete — all four sections done.' : `${remaining} of 4 sections remaining.`,
      M,
      y + 12,
    );
    y += 20;
  }

  // page numbers (skip cover)
  const total = doc.getNumberOfPages();
  for (let p = 2; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SOFT);
    doc.text(`${p - 1} / ${total - 1}`, pageW / 2, pageH - 24, { align: 'center' });
  }

  const safeName = profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`vocabulary-notebook-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** Full JSON backup (images embedded as base64 data URLs). */
export async function downloadJsonBackup(profile: Profile): Promise<void> {
  const envelope = await exportBackup(profile);
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(
    blob,
    `vocabulary-backup-${profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`,
  );
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Compact text summary the student can paste to their tutor. */
export async function buildProgressSummary(profile: Profile): Promise<string> {
  const words = await listWords(profile.id!);
  const now = Date.now();
  const byTag = new Map<LevelTag, number>();
  let sectionsDone = 0;
  let finished = 0;
  let overdue = 0;
  let dueToday = 0;

  for (const w of words) {
    for (const t of w.levelTags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
    const done = w.sections.filter((s) => s.completedAt != null);
    sectionsDone += done.length;
    if (done.length === 4) finished++;
    for (let i = 1; i <= 4; i++) {
      const st = dueState(w.sections[i - 1]?.unlockedAt, w.sections[i - 1]?.completedAt, now);
      if (st === 'overdue') overdue++;
      else if (st === 'due') dueToday++;
    }
  }

  const weekAgo = now - 7 * 86_400_000;
  const recent = words.filter((w) => w.dateAdded >= weekAgo).map((w) => w.word);
  const tagLine =
    Array.from(byTag.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, n]) => `${t}: ${n}`)
      .join(' | ') || '—';

  return [
    `📖 ${profile.name}'s Vocabulary Notebook — ${new Date().toLocaleDateString()}`,
    ``,
    `🔥 Streak: ${profile.stats.streakCount} day(s)`,
    `📚 Words learned: ${words.length}`,
    `   by level → ${tagLine}`,
    `✅ Sections completed: ${sectionsDone} of ${words.length * 4}`,
    `🏆 Words fully finished: ${finished}`,
    `🔴 Overdue sections: ${overdue}`,
    `🟡 Due today: ${dueToday}`,
    recent.length > 0 ? `🌱 New this week: ${recent.slice(0, 8).join(', ')}${recent.length > 8 ? '…' : ''}` : ``,
    ``,
    `— sent from Vocabulary Notebook (offline PWA)`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}

export async function shareOrCopySummary(text: string): Promise<'shared' | 'copied' | 'downloaded'> {
  const nav = navigator as Navigator & { share?: (d: { text: string; title?: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: 'My vocabulary progress', text });
      return 'shared';
    } catch {
      // user cancelled or share failed — fall through to copy
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    triggerDownload(new Blob([text], { type: 'text/plain' }), 'vocabulary-progress.txt');
    return 'downloaded';
  }
}

/** Words count helper used by settings screen. */
export async function countWords(profileId: number): Promise<number> {
  return (await listWords(profileId)).length;
}

export type { Word };
