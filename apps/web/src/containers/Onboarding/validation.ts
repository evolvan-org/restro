import type { z } from 'zod';

/** Zod issues keyed by dotted path (`sections.0.tables.2.number`), first message per path. */
export function issuesByPath(error: z.ZodError | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error?.issues ?? []) {
    const path = issue.path.join('.');
    errors[path] ??= issue.message;
  }
  return errors;
}
