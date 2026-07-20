import { DateTime } from 'luxon';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidIanaTimeZone(timeZone: string): boolean {
  return DateTime.now().setZone(timeZone).isValid;
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
