import { JsonArrayStream, parseJsonObject } from './json-array-stream';

function feed(text: string, chunkSize: number, key = 'rows'): unknown[] {
  const stream = new JsonArrayStream(key);
  const out: unknown[] = [];
  for (let index = 0; index < text.length; index += chunkSize) {
    out.push(...stream.push(text.slice(index, index + chunkSize)));
  }
  return out;
}

describe('JsonArrayStream', () => {
  const body = JSON.stringify({
    documentType: 'menu',
    quality: 'ok',
    rows: [
      { name: 'Paneer Tikka', price: '280', issues: ['brace } and bracket ] in a string'] },
      { name: 'Quote "inside" and \\ backslash', variants: [{ name: 'Half', price: '180' }] },
      { name: 'पनीर टिक्का', price: null },
    ],
  });

  it.each([1, 3, 17, 4096])('emits each element as it completes (chunk size %i)', (size) => {
    const rows = feed(body, size) as { name: string }[];
    expect(rows.map((row) => row.name)).toEqual([
      'Paneer Tikka',
      'Quote "inside" and \\ backslash',
      'पनीर टिक्का',
    ]);
  });

  it('emits an element as soon as its closing brace arrives', () => {
    const stream = new JsonArrayStream('rows');
    expect(stream.push('{"rows":[{"name":"A"},{"na')).toEqual([{ name: 'A' }]);
    expect(stream.push('me":"B"}')).toEqual([{ name: 'B' }]);
    expect(stream.push(']}')).toEqual([]);
  });

  it('ignores a truncated tail and keeps the full text', () => {
    const stream = new JsonArrayStream('lines');
    const rows = stream.push('{"header":{"total":"10"},"lines":[{"a":1},{"b":');
    expect(rows).toEqual([{ a: 1 }]);
    expect(stream.fullText).toContain('"total":"10"');
    expect(parseJsonObject(stream.fullText)).toBeNull();
  });

  it('parses the finished object for page-level fields', () => {
    expect(parseJsonObject(body)?.quality).toBe('ok');
    expect(parseJsonObject('[1,2]')).toBeNull();
  });
});
