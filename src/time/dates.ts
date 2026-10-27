// Calendar dates as ISO strings ('YYYY-MM-DD'). A week is named by its Monday.
// Nothing here reads the system clock, so every caller is deterministic.
import { DomainError } from '../domain/errors.js';
import { DAYS, type Day } from '../domain/types.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDate(iso: string): Date {
  const match = ISO_DATE.exec(iso);
  if (match === null) {
    throw new DomainError('INVALID_WEEK', `Expected a date like 2026-11-16, got "${iso}"`);
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('INVALID_WEEK', `Not a real date: "${iso}"`);
  }
  return date;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Throws unless `weekOf` is a well-formed date that falls on a Monday. */
export function assertWeekOf(weekOf: string): string {
  const date = toUtcDate(weekOf);
  if (date.getUTCDay() !== 1) {
    throw new DomainError('INVALID_WEEK', `${weekOf} is not a Monday; weeks are named by their Monday`);
  }
  return weekOf;
}

/** The calendar date of `day` in the week that starts on `weekOf`. */
export function dateOfDay(weekOf: string, day: Day): string {
  const monday = toUtcDate(weekOf);
  monday.setUTCDate(monday.getUTCDate() + DAYS.indexOf(day));
  return toIso(monday);
}

/** The Monday that starts the week after `weekOf`. Handy for `build` next week. */
export function nextWeek(weekOf: string): string {
  const monday = toUtcDate(weekOf);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return toIso(monday);
}
