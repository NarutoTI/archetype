import { describe, expect, it } from 'vitest';
import { isValidIanaTimeZone } from '../../../src/utils/timezone.js';

describe('isValidIanaTimeZone', () => {
  it('accepts named IANA zones', () => {
    expect(isValidIanaTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidIanaTimeZone('Europe/London')).toBe(true);
    expect(isValidIanaTimeZone('Etc/GMT-3')).toBe(true);
  });

  it('accepts self-contained fixed offsets (DST-blind but unambiguous)', () => {
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('GMT')).toBe(true);
    expect(isValidIanaTimeZone('+03:00')).toBe(true);
    expect(isValidIanaTimeZone('-03:00')).toBe(true);
    expect(isValidIanaTimeZone('+00:00')).toBe(true);
  });

  it('rejects relative keywords that resolve to the server zone', () => {
    // Passam no isValid da Luxon, mas significam "o fuso de quem roda o código".
    expect(isValidIanaTimeZone('local')).toBe(false);
    expect(isValidIanaTimeZone('system')).toBe(false);
    expect(isValidIanaTimeZone('default')).toBe(false);
    expect(isValidIanaTimeZone(null as unknown as string)).toBe(false);
    expect(isValidIanaTimeZone(undefined as unknown as string)).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(isValidIanaTimeZone('')).toBe(false);
    expect(isValidIanaTimeZone('   ')).toBe(false);
    expect(isValidIanaTimeZone('foobar')).toBe(false);
    expect(isValidIanaTimeZone(' America/Sao_Paulo ')).toBe(false);
  });
});
