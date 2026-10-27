import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import type { Shift } from '../src/domain/types.js';
import { standardGrid } from '../src/roster/grid.js';
import { ScheduleService, standardDeviation } from '../src/schedule/ScheduleService.js';
import { InMemoryRepository } from '../src/storage/InMemoryRepository.js';
import { counterIds, WEEK, win, worker, world } from './helpers.js';

// Three workers who, between them, can cover Monday's single-staff cells.
const ana = worker('a', 'Ana', 6, [win('Mon', '08:00', '18:00')]);
const bea = worker('b', 'Bea', 4, [win('Mon', '08:00', '18:00'), win('Tue', '08:00', '12:00')]);
const cal = worker('c', 'Cal', 10, [win('Tue', '08:00', '18:00')]);

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof DomainError ? e.code : 'not a DomainError';
  }
}

describe('build', () => {
  it('persists the auto-schedule and replaces whatever the week held', () => {
    const { schedule } = world([ana, bea, cal]);
    schedule.assign(WEEK, 'Mon-16', 'a');
    const result = schedule.build(WEEK);
    expect(result.assignments.length).toBeGreaterThan(0);
    expect(schedule.assignments(WEEK)).toEqual(result.assignments);
    expect(schedule.assignments(WEEK).every((a) => a.source === 'auto')).toBe(true);
  });

  it('insists weekOf is a Monday', () => {
    const { schedule } = world([ana]);
    expect(code(() => schedule.build('2026-11-18'))).toBe('INVALID_WEEK');
  });
});

describe('assign / unassign (R5)', () => {
  it('records a manual assignment that passes R1-R3', () => {
    const { schedule } = world([ana]);
    expect(schedule.assign(WEEK, 'Mon-08', 'a')).toEqual({
      shiftId: 'Mon-08',
      workerId: 'a',
      weekOf: WEEK,
      source: 'manual',
    });
  });

  it('rejects unavailable workers unless forced, and never forces past the cap', () => {
    const { schedule } = world([ana, bea]);
    expect(code(() => schedule.assign(WEEK, 'Tue-14', 'a'))).toBe('NOT_AVAILABLE');
    expect(schedule.assign(WEEK, 'Tue-14', 'a', true).source).toBe('manual');

    schedule.assign(WEEK, 'Mon-08', 'b');
    schedule.assign(WEEK, 'Mon-14', 'b');
    expect(code(() => schedule.assign(WEEK, 'Tue-16', 'b', true))).toBe('OVER_CAP');
  });

  it('refuses unknown shifts and workers, duplicates, and full shifts', () => {
    const { schedule } = world([ana, bea, cal]);
    expect(code(() => schedule.assign(WEEK, 'Sat-08', 'a'))).toBe('SHIFT_NOT_FOUND');
    expect(code(() => schedule.assign(WEEK, 'Mon-08', 'nobody'))).toBe('WORKER_NOT_FOUND');
    schedule.assign(WEEK, 'Mon-08', 'a');
    expect(code(() => schedule.assign(WEEK, 'Mon-08', 'a'))).toBe('ALREADY_ASSIGNED');
    expect(code(() => schedule.assign(WEEK, 'Mon-08', 'b'))).toBe('SHIFT_FULL');
  });

  it('unassigns, and complains when there was nothing to remove', () => {
    const { schedule } = world([ana]);
    schedule.assign(WEEK, 'Mon-08', 'a');
    schedule.unassign(WEEK, 'Mon-08', 'a');
    expect(schedule.assignments(WEEK)).toEqual([]);
    expect(code(() => schedule.unassign(WEEK, 'Mon-08', 'a'))).toBe('NOT_ASSIGNED');
  });
});

describe('swaps (R6)', () => {
  it('requires the giver to hold the shift', () => {
    const { schedule } = world([ana, bea]);
    expect(code(() => schedule.requestSwap(WEEK, 'Mon-08', 'a', 'b'))).toBe('NOT_ASSIGNED');
  });

  it('accepting moves the assignment and marks it as a swap', () => {
    const { schedule } = world([ana, bea]);
    schedule.assign(WEEK, 'Mon-08', 'a');
    const swap = schedule.requestSwap(WEEK, 'Mon-08', 'a', 'b');
    expect(swap).toMatchObject({ id: 'id-1', status: 'pending' });

    const moved = schedule.acceptSwap(swap.id);
    expect(moved).toEqual({ shiftId: 'Mon-08', workerId: 'b', weekOf: WEEK, source: 'swap' });
    expect(schedule.assignments(WEEK)).toEqual([moved]);
    expect(schedule.swaps(WEEK)[0].status).toBe('accepted');
  });

  it('declining leaves the schedule alone and closes the request', () => {
    const { schedule } = world([ana, bea]);
    schedule.assign(WEEK, 'Mon-08', 'a');
    const swap = schedule.requestSwap(WEEK, 'Mon-08', 'a', 'b');
    expect(schedule.declineSwap(swap.id).status).toBe('declined');
    expect(schedule.assignments(WEEK)[0].workerId).toBe('a');
    expect(code(() => schedule.acceptSwap(swap.id))).toBe('SWAP_NOT_PENDING');
    expect(code(() => schedule.acceptSwap('id-99'))).toBe('SWAP_NOT_FOUND');
  });

  it('rejects a receiver who is not available for the shift', () => {
    const { schedule } = world([ana, cal]);
    schedule.assign(WEEK, 'Mon-08', 'a');
    const swap = schedule.requestSwap(WEEK, 'Mon-08', 'a', 'c');
    expect(code(() => schedule.acceptSwap(swap.id))).toBe('NOT_AVAILABLE');
    expect(schedule.swaps()[0].status).toBe('pending');
  });

  it('rejects a receiver who already works an overlapping shift', () => {
    // A grid with one extra shift straddling two cells, so Bea genuinely overlaps Mon-08.
    const straddle: Shift = { id: 'Mon-09x', day: 'Mon', start: '09:00', end: '11:00', requiredStaff: 1 };
    const repo = new InMemoryRepository({
      workers: [ana, bea],
      shifts: [...standardGrid(), straddle],
      assignments: [
        { shiftId: 'Mon-08', workerId: 'a', weekOf: WEEK, source: 'auto' },
        { shiftId: 'Mon-09x', workerId: 'b', weekOf: WEEK, source: 'auto' },
      ],
      swaps: [],
    });
    const schedule = new ScheduleService(repo, counterIds());
    const swap = schedule.requestSwap(WEEK, 'Mon-08', 'a', 'b');
    expect(code(() => schedule.acceptSwap(swap.id))).toBe('OVERLAPPING_SHIFT');
  });
});

describe('reports (R7, R8)', () => {
  it('coverage marks under-staffed shifts open', () => {
    const { schedule } = world([ana]);
    schedule.assign(WEEK, 'Mon-08', 'a');
    const rows = schedule.coverage(WEEK);
    expect(rows[0]).toMatchObject({ required: 1, open: false });
    expect(rows[0].assigned.map((w) => w.name)).toEqual(['Ana']);
    expect(rows[1]).toMatchObject({ required: 2, open: true, assigned: [] });
    expect(rows.filter((r) => r.open)).toHaveLength(24);
  });

  it('fairness reports hours against caps and the spread of utilisation', () => {
    const { schedule } = world([ana, bea]);
    schedule.assign(WEEK, 'Mon-08', 'a');
    schedule.assign(WEEK, 'Mon-14', 'a');
    schedule.assign(WEEK, 'Mon-16', 'b');
    const report = schedule.fairness(WEEK);
    expect(report.rows.map((r) => [r.worker.name, r.hours, r.cap, r.utilisation])).toEqual([
      ['Ana', 4, 6, 4 / 6],
      ['Bea', 2, 4, 0.5],
    ]);
    expect(report.stdDev).toBeCloseTo(standardDeviation([4 / 6, 0.5]), 10);
    expect(standardDeviation([])).toBe(0);
    expect(standardDeviation([0, 1])).toBe(0.5);
  });

});
