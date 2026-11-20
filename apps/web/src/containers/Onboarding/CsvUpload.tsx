'use client';

import { Download, FileText, Upload } from 'lucide-react';
import { type ReactElement, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { downloadBlob } from '@/lib/download-blob';

export function downloadCsvTemplate(filename: string, lines: readonly string[]): void {
  downloadBlob(new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv' }), filename);
}

/** Template download plus a file picker; the parent decides what to do with the chosen file. */
export function CsvUpload({
  templateName,
  templateLines,
  fileName,
  summary,
  busy,
  error,
  maxBytes,
  onFile,
}: {
  templateName: string;
  templateLines: readonly string[];
  fileName?: string;
  /** e.g. "42 rows · 6 categories", shown once a file was read. */
  summary?: string;
  busy: boolean;
  error?: string;
  maxBytes: number;
  onFile: (file: File) => void;
}): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="h-11"
          onClick={() => downloadCsvTemplate(templateName, templateLines)}
        >
          <Download aria-hidden />
          Download {templateName}
        </Button>
        <Button className="h-11" disabled={busy} onClick={() => input.current?.click()}>
          <Upload aria-hidden />
          {busy ? 'Checking…' : fileName ? 'Replace file' : 'Upload CSV'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="CSV file"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onFile(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {fileName && !error && (
        <p className="flex items-center gap-2 text-sm text-neutral-700">
          <FileText className="size-4" aria-hidden />
          <strong className="font-semibold">{fileName}</strong>
          {summary && <span>· {summary}</span>}
        </p>
      )}
      <p className="text-xs text-neutral-600">
        Files up to {Math.round(maxBytes / 1024)} KB. The file is checked here and nothing is saved
        until you finish setup.
      </p>
    </div>
  );
}
