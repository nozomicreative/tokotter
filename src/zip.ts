// ZIP writer over fflate (deflate) with STORE fallback for tiny entries.
import { strToU8, zipSync } from 'fflate';
import type { ZipEntry } from './types';

export function makeZip(entries: { name: string; text: string }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.name] = strToU8(e.text);
  return zipSync(files, { level: 6 });
}

export function makeZipBytes(entries: ZipEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) files[e.name] = e.data;
  return zipSync(files, { level: 6 });
}
