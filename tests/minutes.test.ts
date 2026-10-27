import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { assertWeekOf, dateOfDay, nextWeek } from '../src/time/dates.js';
import { contains, formatTime, hoursOf, overlaps, parseTime, toSpan } from '../src/time/minutes.js';

describe('parseTime / formatTime', () => {
  it('round-trips HH:MM through minutes since midnight', () => {
    expect(parseTime('08:00')).toBe(480);
    expect(parseTime('17:45')).toBe(1065);
    expect(formatTime(480)).toBe('08:00');
    expect(formatTime(1065)).toBe('17:45');
  });

  it('rejects malformed and out-of-range times with INVALID_TIME', () => {
    for (const bad of ['8:00', '08:0', '25:00', '12:60', 'noon']) {
      expect(() => parseTime(bad)).toThrowError(DomainError);
      expect(() => parseTime(bad)).toThrowError(/time/i);
    }
    expect(() => formatTime(-1)).toThrowError(DomainError);
  });
});

describe('toSpan / hoursOf', () => {
  it('builds a span, measures it in hours, and refuses one that does not run forwards', () => {
    const span = toSpan('10:00', '12:30');
    expect(span).toEqual({ start: 600, end: 750 });
    expect(hoursOf(span)).toBe(2.5);
    expect(() => toSpan('12:00', '10:00')).toThrowError(DomainError);
    expect(() => toSpan('12:00', '12:00')).toThrowError(/end after/);
  });
});

describe('overlaps', () => {
  it('detects partial and nested overlap in either order', () => {
    const a = toSpan('10:00', '12:00');
    const b = toSpan('11:00', '13:00');
    const inner = toSpan('10:30', '11:30');
    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
    expect(overlaps(a, inner)).toBe(true);
  });

  it('is false for spans with a gap between them', () => {
    expect(overlaps(toSpan('08:00', '10:00'), toSpan('12:00', '14:00'))).toBe(false);
  });

  it('treats back-to-back spans as free, since a span ends at its end minute (R2)', () => {
    expect(overlaps(toSpan('10:00', '12:00'), toSpan('12:00', '14:00'))).toBe(false);
    expect(overlaps(toSpan('12:00', '14:00'), toSpan('10:00', '12:00'))).toBe(false);
  });
});

describe('contains', () => {
  it('is true when the inner span sits inside the outer, edges included', () => {
    const outer = toSpan('08:00', '14:00');
    expect(contains(outer, toSpan('08:00', '10:00'))).toBe(true);
    expect(contains(outer, toSpan('12:00', '14:00'))).toBe(true);
    expect(contains(outer, toSpan('13:00', '15:00'))).toBe(false);
    expect(contains(toSpan('10:00', '12:00'), outer)).toBe(false);
  });
});

describe('dates', () => {
  it('accepts a Monday and rejects anything else', () => {
    expect(assertWeekOf('2026-11-16')).toBe('2026-11-16');
    expect(() => assertWeekOf('2026-11-17')).toThrowError(/not a Monday/);
    expect(() => assertWeekOf('next week')).toThrowError(DomainError);
  });

  it('walks forward through the week and into the next one', () => {
    expect(dateOfDay('2026-11-16', 'Mon')).toBe('2026-11-16');
    expect(dateOfDay('2026-11-16', 'Fri')).toBe('2026-11-20');
    expect(nextWeek('2026-11-30')).toBe('2026-12-07');
  });
});
