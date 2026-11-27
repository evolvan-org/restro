/**
 * Incremental parser for a streamed JSON object of the shape `{ ..., "<key>": [ {...}, {...} ] }`.
 * Feed it text chunks as the model writes them; it returns each array element as soon as that
 * element's closing brace arrives (elements must be objects), so rows can be shown one by one. The complete text is still
 * available for the scalar fields at the end (`fullText`).
 */
export class JsonArrayStream {
  private text = '';
  /** Index just after the array's `[`, once found. */
  private arrayStart: number | null = null;
  private cursor = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private elementStart: number | null = null;
  private done = false;

  constructor(private readonly key: string) {}

  get fullText(): string {
    return this.text;
  }

  push(chunk: string): unknown[] {
    this.text += chunk;
    if (this.arrayStart === null) {
      const match = new RegExp(`"${this.key}"\\s*:\\s*\\[`).exec(this.text);
      if (!match) return [];
      this.arrayStart = match.index + match[0].length;
      this.cursor = this.arrayStart;
    }
    return this.scan();
  }

  private scan(): unknown[] {
    const elements: unknown[] = [];
    while (!this.done && this.cursor < this.text.length) {
      const char = this.text[this.cursor]!;
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (char === '\\') this.escaped = true;
        else if (char === '"') this.inString = false;
      } else if (char === '"') {
        this.inString = true;
      } else if (char === '{' || char === '[') {
        if (this.depth === 0) this.elementStart = this.cursor;
        this.depth += 1;
      } else if (char === '}' || char === ']') {
        if (this.depth === 0 && char === ']') {
          this.done = true;
        } else {
          this.depth -= 1;
          if (this.depth === 0 && this.elementStart !== null) {
            const raw = this.text.slice(this.elementStart, this.cursor + 1);
            this.elementStart = null;
            try {
              elements.push(JSON.parse(raw));
            } catch {
              // A malformed element is dropped; the caller counts drops via validation.
            }
          }
        }
      }
      this.cursor += 1;
    }
    return elements;
  }
}

/** Parses the complete response; null when the model's JSON is unusable. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
