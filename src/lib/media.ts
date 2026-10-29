import { sha256Hex } from '@/domain/hash';

export interface PreparedFile {
  sha256: string;
  preview?: Blob;
  exifTakenAt?: string;
  fileModifiedAt?: string;
  metadata: { width?: number; height?: number; make?: string; model?: string; gps?: boolean };
}

/**
 * Reads what can be read from the original without changing it: its hash, camera metadata and a
 * downscaled preview for fast display. The original file itself is uploaded untouched.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const sha256 = await sha256Hex(await file.arrayBuffer());
  const out: PreparedFile = { sha256, metadata: {}, fileModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined };
  if (file.type.startsWith('image/')) {
    try {
      const { default: exifr } = await import('exifr');
      // reviveValues: false keeps EXIF dates as written. EXIF times have no time zone unless the camera also
      // wrote an offset, so they are stored as camera-clock time ("2025-01-15T09:30:00") or with that offset.
      const tags = await exifr.parse(file, { reviveValues: false, pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'Make', 'Model', 'ExifImageWidth', 'ExifImageHeight', 'GPSLatitude'] });
      if (tags) {
        const taken = exifToIso(tags.DateTimeOriginal ?? tags.CreateDate, tags.OffsetTimeOriginal);
        if (taken) out.exifTakenAt = taken;
        out.metadata = { width: tags.ExifImageWidth, height: tags.ExifImageHeight, make: tags.Make, model: tags.Model, gps: tags.GPSLatitude != null };
      }
    } catch {
      // Metadata is optional; some formats cannot be read in the browser.
    }
    out.preview = await makePreview(file).catch(() => undefined);
    if (out.preview && !out.metadata.width) {
      const bmp = await createImageBitmap(file).catch(() => null);
      if (bmp) {
        out.metadata.width = bmp.width;
        out.metadata.height = bmp.height;
        bmp.close();
      }
    }
  }
  return clean(out);
}

/** "2025:01:15 09:30:00" (+ optional "+02:00") → "2025-01-15T09:30:00" or "2025-01-15T09:30:00+02:00". */
export function exifToIso(value: unknown, offset?: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return undefined;
  const off = typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`;
}

function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

async function makePreview(file: Blob, max = 1600): Promise<Blob | undefined> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/jpeg', 0.82));
}
