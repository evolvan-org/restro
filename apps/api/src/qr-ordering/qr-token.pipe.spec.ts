import { NotFoundException } from '@nestjs/common';

import { QrTokenPipe } from './qr-token.pipe';

describe('QrTokenPipe', () => {
  const pipe = new QrTokenPipe();
  it('accepts a 64-character hex token', () => {
    const token = 'a'.repeat(64);
    expect(pipe.transform(token)).toBe(token);
  });
  it.each(['', 'short', 'A'.repeat(64), `${'a'.repeat(63)}g`, 7])(
    'gives malformed %p the generic 404',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(NotFoundException);
    },
  );
});
