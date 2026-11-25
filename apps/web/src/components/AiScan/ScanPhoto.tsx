'use client';

import type { SourceBox } from '@rms/api-contract';
import { useQuery } from '@tanstack/react-query';
import { ImageOff } from 'lucide-react';
import { type ReactElement, useEffect, useState } from 'react';

import { fetchScanPageImage } from '@/services/api/requests/ai';

/** Object URL of one scanned page, fetched with the owner's token (photos aren't public). */
export function useScanPageUrl(
  jobId: string | undefined,
  page: number | undefined,
  available = true,
): string | null {
  const query = useQuery({
    queryKey: ['ai-scan-page', jobId, page],
    queryFn: () => fetchScanPageImage(jobId!, page!),
    enabled: Boolean(jobId && page && available),
    staleTime: Infinity,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(query.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [query.data]);
  return url;
}

/**
 * The scanned page with the region of the current row highlighted (board "source highlight
 * overlay"). The glow pulses only when motion is allowed.
 */
export function ScanPhoto({
  url,
  highlight,
  label,
  alt,
}: {
  url: string | null;
  highlight?: SourceBox | null;
  label?: string;
  alt: string;
}): ReactElement {
  if (!url) {
    return (
      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg bg-neutral-100 text-sm text-neutral-500">
        <ImageOff className="size-6" aria-hidden />
        Photo not available
      </div>
    );
  }
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-neutral-100 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="block w-full" />
      {highlight && (
        <span
          className="ai-glow absolute rounded-md border-2 border-indigo-600 bg-indigo-500/15"
          style={{
            left: `${highlight.x * 100}%`,
            top: `${highlight.y * 100}%`,
            width: `${highlight.w * 100}%`,
            height: `${highlight.h * 100}%`,
          }}
        >
          {label && (
            <em className="absolute -top-6 right-0 rounded bg-indigo-700 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white not-italic">
              {label}
            </em>
          )}
        </span>
      )}
      <style>{`
        @keyframes ai-glow { 0%,100% { box-shadow: 0 0 0 3px rgba(99,102,241,.25), 0 0 18px 4px rgba(99,102,241,.35); } 50% { box-shadow: 0 0 0 5px rgba(99,102,241,.15), 0 0 26px 8px rgba(99,102,241,.5); } }
        .ai-glow { animation: ai-glow 1.4s ease-in-out infinite; transition: all .25s ease; }
        @media (prefers-reduced-motion: reduce) { .ai-glow { animation: none; transition: none; box-shadow: 0 0 0 3px rgba(99,102,241,.3); } }
      `}</style>
    </div>
  );
}

/** The printed line a low-confidence value came from, cropped from the photo. */
export function SourceSnippet({
  url,
  box,
  rawText,
}: {
  url: string | null;
  box: SourceBox | null;
  rawText: string | null;
}): ReactElement | null {
  if (url && box && box.w > 0 && box.h > 0) {
    const pad = 0.01;
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    const w = Math.min(1 - x, box.w + pad * 2);
    const h = Math.min(1 - y, box.h + pad * 2);
    return (
      <span
        role="img"
        aria-label={rawText ? `Printed on the menu: ${rawText}` : 'Where this was printed'}
        className="inline-block h-[26px] max-w-full rounded border border-amber-300 bg-no-repeat"
        style={{
          width: `${Math.min(220, Math.round((w / h) * 26))}px`,
          backgroundImage: `url(${url})`,
          backgroundSize: `${100 / w}% ${100 / h}%`,
          backgroundPosition: `${w < 1 ? (x / (1 - w)) * 100 : 0}% ${h < 1 ? (y / (1 - h)) * 100 : 0}%`,
        }}
      />
    );
  }
  if (!rawText) return null;
  return (
    <span className="inline-flex h-7 items-center rounded border border-amber-300 bg-amber-50 px-2 font-serif text-xs text-amber-950">
      {rawText}
    </span>
  );
}
