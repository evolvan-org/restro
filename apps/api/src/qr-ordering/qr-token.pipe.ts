import { Injectable, NotFoundException, type PipeTransform } from '@nestjs/common';
import { QR_TOKEN_PATTERN } from '@rms/api-contract';

/** Malformed tokens get the same generic "not working" 404 as unknown ones. */
@Injectable()
export class QrTokenPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !QR_TOKEN_PATTERN.test(value)) {
      throw new NotFoundException('This QR code isn’t working');
    }
    return value;
  }
}
