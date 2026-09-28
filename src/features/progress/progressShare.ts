/**
 * Progress sharing (Part 3) — everything client-side, no server.
 *  - JSON report file: compact, tutor-importable, private by default
 *  - Summary image: rendered from a hidden DOM card via html-to-image
 *  - Certificate PDF: jsPDF, one page, hand-warming
 */
import { listWords, getWeeklyGoals } from '../../db/repo';
import { db } from '../../db/db';
import type { Profile, ProgressReport, WeeklyGoals } from '../../db/models';
import {
  buildProgressReport,
  computeSkills,
  collectSkillSamples,
  isWordMastered,
} from '../../db/progress';
import { triggerDownload } from '../exports/exporters';

async function gather(profile: Profile) {
  const [words, events, snapshots, goals] = await Promise.all([
    listWords(profile.id!),
    db.events.where('profileId').equals(profile.id!).toArray(),
    db.snapshots.where('profileId').equals(profile.id!).toArray(),
    getWeeklyGoals(profile.id!),
  ]);
  return { words, events, snapshots, goals };
}

/** Build the report JSON for a date range (0 = whole term). */
export async function makeReport(profile: Profile, rangeDays: 7 | 30 | 0, bestSentences?: { word: string; text: string }[]): Promise<ProgressReport> {
  const { words, events, snapshots, goals } = await gather(profile);
  const report = buildProgressReport(profile, words, events, snapshots, goals, rangeDays, Date.now());
  if (bestSentences && bestSentences.length > 0) report.bestSentences = bestSentences;
  return report;
}

export async function downloadReportJson(profile: Profile, rangeDays: 7 | 30 | 0, bestSentences?: { word: string; text: string }[]): Promise<void> {
  const report = await makeReport(profile, rangeDays, bestSentences);
  const json = JSON.stringify(report, null, 2);
  const safeName = profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  triggerDownload(
    new Blob([json], { type: 'application/json' }),
    `progress-report-${safeName}-${new Date().toISOString().slice(0, 10)}.json`,
  );
}

/** Candidate own sentences (section 3), most recently completed first. */
export async function bestSentenceCandidates(profile: Profile): Promise<{ word: string; text: string; at: number }[]> {
  const words = await listWords(profile.id!);
  const out: { word: string; text: string; at: number }[] = [];
  for (const w of words) {
    const s = w.sections[2];
    if (s?.completedAt != null && s.text?.trim()) out.push({ word: w.word, text: s.text.trim(), at: s.completedAt });
  }
  return out.sort((a, b) => b.at - a.at);
}

// ---------- summary image ----------

/** Render the given element to a PNG and download it. */
export async function downloadElementImage(el: HTMLElement, filename: string): Promise<void> {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(el, { backgroundColor: '#faf6ee', pixelRatio: 2, cacheBust: true });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ---------- certificate PDF ----------

export async function downloadCertificate(profile: Profile, _goals?: WeeklyGoals, now = Date.now()): Promise<void> {
  const { words, events } = await gather(profile);
  const mastered = words.filter(isWordMastered).length;
  const sentences = events.filter((e) => e.type === 'own_sentence_written').length;
  const samples = collectSkillSamples(events, words);
  const skills = computeSkills(samples);
  const recognition = skills[1].display;
  const firstDay = words.length > 0 ? Math.min(...words.map((w) => w.dateAdded)) : now;
  const fmt = (ts: number) => new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // warm border
  doc.setFillColor(250, 246, 238);
  doc.rect(0, 0, W, H, 'F');
  doc.setDrawColor(201, 111, 74);
  doc.setLineWidth(3);
  doc.roundedRect(28, 28, W - 56, H - 56, 16, 16, 'S');
  doc.setLineWidth(1);
  doc.roundedRect(36, 36, W - 72, H - 72, 12, 12, 'S');

  doc.setTextColor(59, 49, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(201, 111, 74);
  doc.text('VOCABULARY NOTEBOOK', W / 2, 110, { align: 'center' });

  doc.setTextColor(59, 49, 40);
  doc.setFontSize(34);
  doc.text('Certificate of Progress', W / 2, 170, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(107, 93, 79);
  doc.text('This notebook belongs to', W / 2, 225, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.setTextColor(59, 49, 40);
  doc.text(profile.name, W / 2, 280, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(107, 93, 79);
  const stats: [string, string][] = [
    [String(mastered), 'words truly mastered'],
    [String(sentences), 'own sentences written'],
    [String(profile.stats.streakCount), 'current streak (days)'],
    [recognition != null ? `${recognition}%` : '—', 'review recognition'],
  ];
  let y = 340;
  for (const [num, label] of stats) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(95, 157, 95);
    doc.text(num, W / 2 - 12, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(107, 93, 79);
    doc.text(label, W / 2 + 4, y, { align: 'left' });
    y += 44;
  }

  doc.setFontSize(11);
  doc.setTextColor(107, 93, 79);
  doc.text(`From ${fmt(firstDay)}  to  ${fmt(now)}`, W / 2, y + 24, { align: 'center' });

  doc.setFontSize(9.5);
  doc.setTextColor(156, 141, 124);
  doc.text('Made offline with Vocabulary Notebook', W / 2, H - 70, { align: 'center' });

  const safeName = profile.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`certificate-${safeName}-${new Date(now).toISOString().slice(0, 10)}.pdf`);
}

// ---------- tutor import parsing ----------

export function parseReportFile(text: string): ProgressReport | null {
  try {
    const data = JSON.parse(text) as ProgressReport;
    if (data?.app !== 'vocabulary-notebook-progress' || typeof data.studentName !== 'string') return null;
    if (!Array.isArray(data.daily) || !data.totals) return null;
    return data;
  } catch {
    return null;
  }
}

export type { WeeklyGoals };
