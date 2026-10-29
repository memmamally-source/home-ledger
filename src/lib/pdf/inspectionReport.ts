import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { Brand } from '@/config/brand';
import type { Market } from '@/config/markets';
import { captureGap } from '@/domain/evidence';
import { defectsOf, inspectionProgress, sortedItems, sortedRooms } from '@/domain/inspection/logic';
import { CONDITION_LABELS, INSPECTION_TYPE_LABELS, SEVERITY_LABELS, type EvidenceRecord, type Inspection, type InspectionSignature } from '@/domain/inspection/types';
import { ROLE_LABELS } from '@/domain/roles';
import { fmtClaimed, fmtDate, fmtInstant } from '@/lib/format';
import { toDate } from '@/lib/live';

export interface ReportInput {
  inspection: Inspection;
  evidence: EvidenceRecord[];
  signatures: InspectionSignature[];
  market: Market;
  generatedBy: string;
  /** Loads an image for the report (the preview where one exists). Returns null if unavailable. */
  loadImage: (e: EvidenceRecord) => Promise<{ dataUrl: string; width: number; height: number } | null>;
  onProgress?: (done: number, total: number) => void;
}

// jsPDF's built-in fonts cover Latin-1 only. Character classes are built from code points so the
// source stays plain ASCII.
const cls = (...codes: number[]) => `[${codes.map((c) => String.fromCodePoint(c)).join('')}]`;
const SINGLE_QUOTES = new RegExp(cls(0x2018, 0x2019, 0x02bc), 'g');
const DOUBLE_QUOTES = new RegExp(cls(0x201c, 0x201d), 'g');
const DASHES = new RegExp(cls(0x2013, 0x2014), 'g');
const ELLIPSIS = new RegExp(cls(0x2026), 'g');
const THIN_SPACES = new RegExp(cls(0x2007, 0x2009, 0x202f), 'g');
const NOT_LATIN1 = /[^\t\n\r\x20-\x7e\xa0-\xff]/gu;

export function pdfSafe(s: string | undefined | null): string {
  return (s ?? '')
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(ELLIPSIS, '...')
    .replace(THIN_SPACES, ' ')
    .replace(NOT_LATIN1, '?');
}

const INK: [number, number, number] = [17, 17, 17];
const MUTED: [number, number, number] = [102, 101, 94];
const ACCENT: [number, number, number] = [31, 77, 58];
const IVORY: [number, number, number] = [248, 243, 231];
const TINT: [number, number, number] = [242, 237, 225];
const RULE: [number, number, number] = [230, 222, 205];
const COND_COLOR: Record<string, [number, number, number]> = { good: [44, 122, 75], defective: [178, 65, 44], not_tested: [154, 106, 18], na: [109, 119, 135], none: [109, 119, 135] };

/** The logo mark (roof over an open ledger), drawn as vectors so it stays sharp. `size` in mm. */
function drawMark(doc: jsPDF, x: number, y: number, size: number) {
  const k = size / 48;
  doc.setFillColor(...ACCENT).roundedRect(x, y, size, size, 13 * k, 13 * k, 'F');
  doc.setDrawColor(...IVORY).setLineWidth(2.9 * k).setLineCap('round').setLineJoin('round');
  doc.lines([[14 * k, -11.4 * k], [14 * k, 11.4 * k]], x + 10 * k, y + 22.2 * k, [1, 1], 'S', false);
  doc.setFillColor(...IVORY);
  // left and right pages
  doc.lines([[-11.6 * k, -2.5 * k], [0, 13.6 * k], [11.6 * k, 2.5 * k]], x + 24 * k, y + 26.4 * k, [1, 1], 'F', true);
  doc.lines([[11.6 * k, -2.5 * k], [0, 13.6 * k], [-11.6 * k, 2.5 * k]], x + 24 * k, y + 26.4 * k, [1, 1], 'F', true);
  doc.setDrawColor(...ACCENT).setLineWidth(1.7 * k).line(x + 24 * k, y + 26.4 * k, x + 24 * k, y + 39 * k);
  doc.setLineWidth(0.2).setLineCap('butt');
}

export async function buildInspectionReport(input: ReportInput): Promise<Blob> {
  const { inspection: i, evidence, signatures, market } = input;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 16;
  let y = M;
  const t = (s: string | undefined | null) => pdfSafe(s);
  const ensure = (h: number) => {
    if (y + h > H - 18) {
      doc.addPage();
      y = M;
    }
  };
  const heading = (s: string, size = 13) => {
    ensure(14);
    doc.setFont('helvetica', 'bold').setFontSize(size).setTextColor(...INK);
    doc.text(t(s), M, y);
    y += size * 0.5 + 2;
  };
  const para = (s: string, size = 9, color: [number, number, number] = MUTED) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...color);
    const lines = doc.splitTextToSize(t(s), W - 2 * M) as string[];
    ensure(lines.length * size * 0.42 + 2);
    doc.text(lines, M, y);
    y += lines.length * size * 0.42 + 2;
  };
  const after = () => ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 6;

  // ---- header ----
  doc.setFillColor(...ACCENT).rect(0, 0, W, 4, 'F');
  y += 4;
  drawMark(doc, M, y - 4.6, 7);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK).text(t(Brand.name), M + 9.5, y);
  doc.setFont('helvetica', 'normal').setTextColor(...MUTED).text(t(`${INSPECTION_TYPE_LABELS[i.type]} inspection report`), W - M, y, { align: 'right' });
  y += 11;
  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(...INK).text(doc.splitTextToSize(t(i.title), W - 2 * M) as string[], M, y);
  y += 8;
  const statusText = i.status === 'completed' ? 'COMPLETED' : i.status === 'void' ? `VOID: ${i.voidReason ?? ''}` : 'DRAFT - NOT COMPLETED, MAY STILL CHANGE';
  doc.setFontSize(10).setTextColor(...(i.status === 'completed' ? ACCENT : COND_COLOR.defective!)).text(t(statusText), M, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2, textColor: INK },
    columnStyles: { 0: { fontStyle: 'bold', textColor: MUTED, cellWidth: 38 } },
    body: [
      ['Property', t(i.propertyName)],
      ['Address', t(i.propertyAddress)],
      ['Inspection date', t(fmtDate(i.inspectionDate, market))],
      ['Type', t(INSPECTION_TYPE_LABELS[i.type])],
      ['Tenant', t(i.parties.tenantName || '-')],
      ['Landlord', t(i.parties.landlordName || '-')],
      ['Inspected by', t(i.parties.inspectorName || '-')],
      ...(i.parties.othersPresent ? [['Also present', t(i.parties.othersPresent)]] : []),
      ['Created by', t(`${i.createdByName} (${ROLE_LABELS[i.createdByRole]})`)],
    ],
  });
  y = after();

  // ---- integrity ----
  const pr = inspectionProgress(i.rooms);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Record details', '']],
    headStyles: { fillColor: TINT, textColor: INK, fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: RULE },
    columnStyles: { 0: { cellWidth: 52, textColor: MUTED } },
    body: [
      ['Completed (server time)', i.completedAt ? t(fmtInstant(i.completedAt, market)) : 'Not completed'],
      ['Content hash (SHA-256)', t(i.contentHash ?? 'Not completed')],
      ['Items', `${pr.total} total: ${pr.good} good, ${pr.defective} defective, ${pr.notTested} not tested, ${pr.na} not applicable, ${pr.unchecked} not inspected`],
      ['Evidence files', `${evidence.filter((e) => !e.addendum).length} original, ${evidence.filter((e) => e.addendum).length} added after completion`],
      ['Signatures', String(signatures.length)],
      ['Report generated', t(`${fmtInstant(new Date(), market)} by ${input.generatedBy} (device clock)`)],
    ],
  });
  y = after();

  // ---- defects ----
  const defects = defectsOf(i.rooms);
  heading(`Defects (${defects.length})`);
  if (defects.length === 0) para('No items were marked defective.');
  else
    autoTable(doc, {
      startY: y,
      theme: 'striped',
      head: [['Room', 'Item', 'Severity', 'Description', 'Follow-up', 'Evidence']],
      headStyles: { fillColor: ACCENT },
      styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
      columnStyles: { 3: { cellWidth: 60 } },
      body: defects.map(({ room, item }) => [
        t(room.name),
        t(item.label),
        t(SEVERITY_LABELS[item.severity ?? 'minor']),
        t([item.defectDescription, item.comment].filter(Boolean).join(' / ') || '-'),
        item.followUp ? 'Yes' : '',
        t(evidence.filter((e) => e.itemId === item.id).map((e) => e.ref).join(', ')),
      ]),
    });
  if (defects.length) y = after();

  // ---- rooms ----
  const total = evidence.length;
  let done = 0;
  for (const room of sortedRooms(i.rooms)) {
    ensure(30);
    heading(room.name, 12);
    const items = sortedItems(room);
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      head: [['Item', 'Condition', 'Notes', 'Photos']],
      headStyles: { fillColor: TINT, textColor: INK },
      styles: { fontSize: 8, cellPadding: 1.5, lineColor: RULE, overflow: 'linebreak' },
      columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 24 }, 3: { cellWidth: 30 } },
      body: items.map((item) => [
        t(`${item.label}${item.custom ? ' (added)' : ''}`),
        item.condition ? CONDITION_LABELS[item.condition] : 'Not inspected',
        t(
          [
            item.condition === 'defective' && item.severity ? `[${SEVERITY_LABELS[item.severity]}]` : '',
            item.defectDescription,
            item.comment,
            item.followUp ? '(follow-up required)' : '',
          ]
            .filter(Boolean)
            .join(' '),
        ),
        t(evidence.filter((e) => e.itemId === item.id).map((e) => e.ref).join(', ')),
      ]),
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1) {
          const c = items[d.row.index]?.condition ?? 'none';
          d.cell.styles.textColor = COND_COLOR[c] ?? MUTED;
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = after();
    if (room.notes) para(`Room notes: ${room.notes}`, 8.5, INK);

    const photos = evidence.filter((e) => e.roomId === room.id).sort((a, b) => (a.ref < b.ref ? -1 : 1));
    if (photos.length) {
      const cols = 3;
      const gap = 4;
      const cw = (W - 2 * M - gap * (cols - 1)) / cols;
      const ih = cw * 0.75;
      for (let k = 0; k < photos.length; k += cols) {
        ensure(ih + 24);
        const row = photos.slice(k, k + cols);
        let rowH = ih;
        for (let c = 0; c < row.length; c++) {
          const e = row[c]!;
          const x = M + c * (cw + gap);
          const img = await input.loadImage(e).catch(() => null);
          done++;
          input.onProgress?.(done, total);
          doc.setDrawColor(...RULE).setFillColor(...IVORY).rect(x, y, cw, ih, 'FD');
          if (img) {
            const scale = Math.min(cw / img.width, ih / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            doc.addImage(img.dataUrl, 'JPEG', x + (cw - w) / 2, y + (ih - h) / 2, w, h, undefined, 'FAST');
          } else {
            doc.setFontSize(8).setTextColor(...MUTED).text(e.kind === 'video' ? 'Video (see app)' : 'Image unavailable', x + cw / 2, y + ih / 2, { align: 'center' });
          }
          const item = e.itemId ? room.items[e.itemId] : undefined;
          const taken = e.claimedCapture.exifTakenAt ?? e.claimedCapture.fileModifiedAt;
          const gapNote = captureGap({ uploadedAt: toDate(e.uploadedAt), exifTakenAt: toDate(e.claimedCapture.exifTakenAt), fileModifiedAt: toDate(e.claimedCapture.fileModifiedAt), addedOnDeviceAt: new Date(e.claimedCapture.addedOnDeviceAt) });
          const caption = [
            `${e.ref}${e.addendum ? ' (ADDED LATER)' : ''}${item ? ` - ${item.label}` : ''}`,
            `Uploaded (server): ${fmtInstant(e.uploadedAt, market)}`,
            `Claimed capture: ${e.claimedCapture.exifTakenAt ? fmtClaimed(e.claimedCapture.exifTakenAt, market) : taken ? fmtInstant(taken, market) : 'not available'} (unverified)`,
            ...(gapNote ? [gapNote.message] : []),
            `SHA-256 ${e.sha256.slice(0, 24)}...`,
          ];
          doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...INK);
          const lines = caption.flatMap((l) => doc.splitTextToSize(t(l), cw) as string[]);
          doc.text(lines, x, y + ih + 3.2);
          rowH = Math.max(rowH, ih + 3 + lines.length * 2.7);
        }
        y += rowH + 5;
      }
    }
    y += 2;
  }

  if (i.generalNotes) {
    heading('General notes');
    para(i.generalNotes, 9, INK);
  }

  // ---- signatures ----
  heading('Signatures and acknowledgements');
  if (signatures.length === 0) para(i.status === 'completed' ? 'Nobody has signed this report yet.' : 'Signatures can be added once the inspection is completed.');
  for (const s of signatures) {
    ensure(48);
    const disputedLabels = s.disputedItemIds
      .map((id) => {
        for (const r of Object.values(i.rooms)) if (r.items[id]) return `${r.name}: ${r.items[id].label}`;
        return null;
      })
      .filter(Boolean);
    doc.setDrawColor(...RULE).roundedRect(M, y, W - 2 * M, 44, 2, 2, 'S');
    try {
      doc.addImage(s.signatureImage, 'PNG', M + 3, y + 3, 50, 20);
    } catch {
      // an unreadable signature image still leaves the written record below
    }
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text(t(`${s.name} (${ROLE_LABELS[s.role]})`), M + 58, y + 7);
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    const agreement = s.agreement === 'agree' ? 'Agrees with the findings' : s.agreement === 'partial' ? 'Partly agrees (disputes some findings)' : 'Disagrees with the findings';
    const lines = [
      `Signed (server time): ${fmtInstant(s.signedAt, market)}`,
      `Receipt acknowledged: ${s.acknowledgedReceipt ? 'Yes' : 'No'}`,
      agreement,
      s.contentHash === i.contentHash ? 'Signed against this report version (content hash matches).' : 'WARNING: signed against a different content hash.',
    ];
    doc.text(lines.map(t), M + 58, y + 12);
    const extra = [s.comment ? `Comment: ${s.comment}` : '', disputedLabels.length ? `Disputed: ${disputedLabels.join('; ')}` : ''].filter(Boolean).join('  ');
    if (extra) doc.text(doc.splitTextToSize(t(extra), W - 2 * M - 6) as string[], M + 3, y + 30);
    y += 48;
  }

  // ---- disclaimer ----
  ensure(30);
  y += 2;
  para(
    `About this report. It was generated by ${Brand.name} from records held in the app. Times marked "server" were recorded by the app's server when the event happened. Photo capture times come from the camera or device and are not verified; a photo uploaded long after it was taken does not prove when it was taken. File hashes were computed on the uploading device and let anyone holding the original file check it is unchanged. Items marked "Not inspected" were not checked and must not be read as being in good condition. This report records observations; it does not decide who is responsible for any damage, and it is not a legal certification.`,
    7.5,
  );

  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    doc.text(t(`${i.propertyName} - ${i.title}`), M, H - 8);
    doc.text(`Page ${n} of ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return doc.output('blob');
}
