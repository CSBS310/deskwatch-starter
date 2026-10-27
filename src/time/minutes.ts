// Time of day as minutes since midnight (R9). Strings exist only at the edges:
// parse on the way in, format on the way out, do arithmetic on numbers in between.
import { DomainError } from '../domain/errors.js';

const MINUTES_PER_DAY = 24 * 60;

/** A half-open span [start, end) in minutes since midnight. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** 'HH:MM' -> minutes since midnight. Throws INVALID_TIME on anything else. */
export function parseTime(text: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (match === null) {
    throw new DomainError('INVALID_TIME', `Expected a time like 08:00, got "${text}"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new DomainError('INVALID_TIME', `Time out of range: "${text}"`);
  }
  return hours * 60 + minutes;
}

/** minutes since midnight -> 'HH:MM'. */
export function formatTime(minutes: number): string {
  if (minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new DomainError('INVALID_TIME', `Cannot format ${minutes} minutes as a time of day`);
  }
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Parse a 'start'/'end' pair into a span, insisting that it runs forwards. */
export function toSpan(start: string, end: string): Span {
  const span = { start: parseTime(start), end: parseTime(end) };
  if (span.end <= span.start) {
    throw new DomainError('INVALID_WINDOW', `Window must end after it starts: ${start}-${end}`);
  }
  return span;
}

/** Length of a span in hours (fractional hours are fine). */
export function hoursOf(span: Span): number {
  return (span.end - span.start) / 60;
}

/** True when the two spans share any minute. */
export function overlaps(a: Span, b: Span): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** True when `inner` lies entirely inside `outer` (touching the edges is fine). */
export function contains(outer: Span, inner: Span): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}
