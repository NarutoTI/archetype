import { DateTime } from 'luxon';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidIanaTimeZone(timeZone: string): boolean {
  // Aceita só fusos absolutos: IANA nomeado (America/Sao_Paulo) e offsets
  // fixos (UTC, GMT, +03:00). Recusa palavras relativas da Luxon
  // ('local' / 'system' / 'default', além de null/undefined) — passam em
  // isValid mas resolvem para o fuso do SERVIDOR, calculando lembretes errados
  // em produção UTC sem erro aparente.
  const zoned = DateTime.now().setZone(timeZone);
  return zoned.isValid && zoned.zone.type !== 'system';
}

/** Convert a wall-clock date and time in an IANA zone to a UTC instant. */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const dateMatch = CALENDAR_DATE.exec(dateStr);
  const timeMatch = CLOCK_TIME.exec(timeStr);
  if (!dateMatch || !timeMatch || !isValidIanaTimeZone(timeZone)) {
    throw new Error(`Invalid zoned datetime: ${dateStr} ${timeStr} [${timeZone}]`);
  }

  const [year, month, day] = dateMatch.slice(1).map(Number);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = timeMatch[3] ? Number(timeMatch[3]) : 0;
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`Invalid zoned datetime: ${dateStr} ${timeStr} [${timeZone}]`);
  }

  const local = DateTime.fromObject(
    { year, month, day, hour, minute, second },
    { zone: timeZone },
  );
  if (!local.isValid) {
    throw new Error(
      `Invalid zoned datetime: ${dateStr} ${timeStr} [${timeZone}] (${local.invalidReason})`,
    );
  }

  const candidates = local.getPossibleOffsets();
  const chosen = candidates.length > 1
    ? candidates.reduce((earliest, current) => (
      current.toMillis() < earliest.toMillis() ? current : earliest
    ))
    : local;
  return chosen.toUTC().toJSDate();
}

export function dateToIso(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toISO() ?? '';
}
