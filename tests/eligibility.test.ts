import { describe, expect, it } from 'vitest';
import type { Assignment } from '../src/domain/types.js';
import { standardGrid } from '../src/roster/grid.js';
import {
  assignedHours,
  availabilityHours,
  canWork,
  isAvailable,
  shiftHours,
} from '../src/schedule/eligibility.js';
import { shift, WEEK, win, worker } from './helpers.js';

const grid = standardGrid();
const held = (shiftId: string, workerId: string): Assignment => ({
  shiftId,
  workerId,
  weekOf: WEEK,
  source: 'auto',
});

describe('standard grid', () => {
  it('has 25 two-hour shifts, two staff for the midday pair', () => {
    expect(grid).toHaveLength(25);
    expect(grid.filter((s) => s.requiredStaff === 2).map((s) => s.id)).toEqual([
      'Mon-10', 'Mon-12', 'Tue-10', 'Tue-12', 'Wed-10', 'Wed-12',
      'Thu-10', 'Thu-12', 'Fri-10', 'Fri-12',
    ]);
    expect(shift('Wed-16')).toMatchObject({ day: 'Wed', start: '16:00', end: '18:00', requiredStaff: 1 });
    expect(grid.every((s) => shiftHours(s) === 2)).toBe(true);
  });
});

describe('isAvailable (R1)', () => {
  const ana = worker('a', 'Ana', 10, [win('Mon', '08:00', '12:00'), win('Tue', '13:00', '18:00')]);

  it('needs the whole shift inside one window on the same day', () => {
    expect(isAvailable(ana, shift('Mon-08'))).toBe(true);
    expect(isAvailable(ana, shift('Mon-10'))).toBe(true);
    expect(isAvailable(ana, shift('Mon-12'))).toBe(false);
    expect(isAvailable(ana, shift('Tue-12'))).toBe(false); // starts an hour before her window
    expect(isAvailable(ana, shift('Tue-14'))).toBe(true);
    expect(isAvailable(ana, shift('Wed-08'))).toBe(false);
  });

  it('sums availability hours across windows', () => {
    expect(availabilityHours(ana)).toBe(9);
  });
});

describe('canWork (R1-R3)', () => {
  const bo = worker('b', 'Bo', 6, [win('Mon', '08:00', '18:00'), win('Tue', '08:00', '18:00')]);

  it('is ok when nothing is in the way', () => {
    expect(canWork(bo, shift('Mon-08'), [], grid)).toEqual({ ok: true });
  });

  it('explains unavailability', () => {
    const verdict = canWork(bo, shift('Wed-08'), [], grid);
    expect(verdict).toMatchObject({ ok: false, code: 'NOT_AVAILABLE' });
    expect(verdict.ok === false && verdict.reason).toMatch(/Bo is not available Wed 08:00-10:00/);
  });

  it('blocks a shift that overlaps one the worker already holds (R2)', () => {
    const wide = worker('c', 'Cy', 10, [win('Mon', '08:00', '18:00')]);
    // Give Cy a one-off shift that straddles two grid cells so the overlap is genuine.
    const custom = [...grid, { id: 'Mon-09x', day: 'Mon' as const, start: '09:00', end: '11:00', requiredStaff: 1 as const }];
    const verdict = canWork(wide, shift('Mon-10'), [held('Mon-09x', 'c')], custom);
    expect(verdict).toMatchObject({ ok: false, code: 'OVERLAPPING_SHIFT' });
  });

  it('blocks the shift that would cross the weekly cap (R3)', () => {
    const current = [held('Mon-08', 'b'), held('Mon-12', 'b'), held('Tue-08', 'b')];
    expect(assignedHours('b', current, grid)).toBe(6);
    const verdict = canWork(bo, shift('Tue-12'), current, grid);
    expect(verdict).toMatchObject({ ok: false, code: 'OVER_CAP' });
    expect(verdict.ok === false && verdict.reason).toMatch(/8h, over the cap of 6h/);
  });

  it('allows reaching the cap exactly, and ignores a shift held on another day', () => {
    const current = [held('Mon-08', 'b'), held('Mon-12', 'b')];
    expect(canWork(bo, shift('Tue-08'), current, grid)).toEqual({ ok: true });
    expect(assignedHours('b', [held('ghost', 'b')], grid)).toBe(0);
  });
});
