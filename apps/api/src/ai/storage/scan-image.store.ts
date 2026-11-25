import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ScanImageType = 'image/jpeg' | 'image/png' | 'image/webp';

const EXTENSIONS: Record<ScanImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const UUID = /^[0-9a-f-]{36}$/i;

/** Sniffs the real image type from magic bytes; the client's MIME type is not trusted. */
export function detectImageType(buffer: Buffer): ScanImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Scan photos on the API server's disk (v1; single instance), one folder per job:
 * `<AI_UPLOAD_DIR>/<restaurantId>/<jobId>/<page>.<ext>`. Deleted once the scan is used or
 * abandoned (see `ScanImageJanitor`). Paths are built only from validated UUIDs and page numbers.
 */
@Injectable()
export class ScanImageStore {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.get<string>('AI_UPLOAD_DIR') ?? './data/ai-uploads');
  }

  private jobDir(restaurantId: string, jobId: string): string {
    if (!UUID.test(restaurantId) || !UUID.test(jobId)) throw new Error('Invalid scan path');
    return path.join(this.root, restaurantId, jobId);
  }

  async save(
    restaurantId: string,
    jobId: string,
    page: number,
    type: ScanImageType,
    data: Buffer,
  ): Promise<void> {
    const dir = this.jobDir(restaurantId, jobId);
    await mkdir(dir, { recursive: true });
    // Replace any earlier photo of this page (a retake may change the format).
    await this.removePage(restaurantId, jobId, page);
    await writeFile(path.join(dir, `${page}.${EXTENSIONS[type]}`), data, { mode: 0o600 });
  }

  async read(
    restaurantId: string,
    jobId: string,
    page: number,
  ): Promise<{ type: ScanImageType; data: Buffer } | null> {
    const dir = this.jobDir(restaurantId, jobId);
    for (const [type, extension] of Object.entries(EXTENSIONS) as [ScanImageType, string][]) {
      try {
        return { type, data: await readFile(path.join(dir, `${page}.${extension}`)) };
      } catch {
        // Try the next extension.
      }
    }
    return null;
  }

  private async removePage(restaurantId: string, jobId: string, page: number): Promise<void> {
    const dir = this.jobDir(restaurantId, jobId);
    await Promise.all(
      Object.values(EXTENSIONS).map((extension) =>
        rm(path.join(dir, `${page}.${extension}`), { force: true }),
      ),
    );
  }

  async purge(restaurantId: string, jobId: string): Promise<void> {
    await rm(this.jobDir(restaurantId, jobId), { recursive: true, force: true });
  }
}
