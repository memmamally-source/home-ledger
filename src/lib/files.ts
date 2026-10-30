import { isNative } from './platform';

/**
 * Saves a generated file (PDF report, data export). In a browser it downloads; in the native app, where
 * downloads don't exist, it writes the file to the app's cache and opens the system share sheet, from which the
 * person can save to Files, email it or send it on.
 */
export async function saveFile(blob: Blob, fileName: string, title?: string): Promise<void> {
  if (!isNative) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const written = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
  await Share.share({ title: title ?? fileName, files: [written.uri] });
}

/** Opens the share sheet with the file (web: Web Share API where it supports files). Returns false if unsupported. */
export async function shareFile(blob: Blob, fileName: string, title?: string): Promise<boolean> {
  if (isNative) {
    await saveFile(blob, fileName, title);
    return true;
  }
  const file = new File([blob], fileName, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({ files: [file], title: title ?? fileName });
  return true;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Shares a link with a message: native share sheet in the app, Web Share in browsers, clipboard otherwise. */
export async function shareLink(text: string, url: string, title: string): Promise<'shared' | 'copied'> {
  if (isNative) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, url, dialogTitle: title });
    return 'shared';
  }
  if (navigator.share) {
    await navigator.share({ title, text, url });
    return 'shared';
  }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return 'copied';
}
