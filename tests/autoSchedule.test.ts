import { describe, expect, it } from 'vitest';
import type { Shift } from '../src/domain/types.js';
import { standardGrid } from '../src/roster/grid.js';
import { autoSchedule, inGridOrder } from '../src/schedule/autoSchedule.js';
import { WEEK, win, worker } from './helpers.js';

// The single-staff cells only: R4's ordering rules are easiest to see there.
const singles: Shift[] = standardGrid().filter((s) => s.requiredStaff === 1);

function who(result: ReturnType<typeof autoSchedule>, shiftId: string): string[] {
  return result.assignments.filter((a) => a.shiftId === shiftId).map((a) => a.workerId);
}

describe('inGridOrder', () => {
  it('sorts Monday first and earlier starts first, whatever the input order', () => {
    const shuffled = [...singles].reverse();
    expect(inGridOrder(shuffled).map((s) => s.id).slice(0, 4)).toEqual(['Mon-08', 'Mon-14', 'Mon-16', 'Tue-08']);
  });
});

describe('autoSchedule (R4)', () => {
  it('leaves a shift open and reports it when nobody is eligible', () => {
    const result = autoSchedule([], singles, WEEK);
    expect(result.assignments).toHaveLength(0);
    expect(result.open).toHaveLength(singles.length);
    expect(result.open[0]).toEqual({ shiftId: 'Mon-08', missing: 1 });
  });

  it('respects availability and tags every assignment as auto for the week', () => {
    const only = worker('a', 'Ana', 10, [win('Mon', '08:00', '10:00')]);
    const result = autoSchedule([only], singles, WEEK);
    expect(result.assignments).toEqual([{ shiftId: 'Mon-08', workerId: 'a', weekOf: WEEK, source: 'auto' }]);
    expect(result.open.map((o) => o.shiftId)).not.toContain('Mon-08');
  });

  it('prefers the worker with the fewest hours so far', () => {
    const ana = worker('a', 'Ana', 10, [win('Mon', '08:00', '18:00'), win('Tue', '08:00', '18:00')]);
    const bea = worker('b', 'Bea', 10, [win('Tue', '08:00', '18:00')]);
    const result = autoSchedule([ana, bea], singles, WEEK);
    // Ana takes all of Monday (nobody else can); Bea, at 0h, then gets Tuesday first.
    expect(who(result, 'Mon-08')).toEqual(['a']);
    expect(who(result, 'Tue-08')).toEqual(['b']);
  });

  it('breaks ties by fewest availability hours, then by name', () => {
    const generous = worker('g', 'Alma', 10, [win('Mon', '08:00', '18:00')]);
    const scarce = worker('s', 'Zed', 10, [win('Mon', '08:00', '10:00')]);
    const result = autoSchedule([generous, scarce], singles, WEEK);
    expect(who(result, 'Mon-08')).toEqual(['s']);

    const kim = worker('k', 'Kim', 10, [win('Mon', '08:00', '10:00')]);
    const abe = worker('x', 'Abe', 10, [win('Mon', '08:00', '10:00')]);
    expect(who(autoSchedule([kim, abe], singles, WEEK), 'Mon-08')).toEqual(['x']);
  });

  it('stops giving a worker shifts once their cap is reached', () => {
    const cap4 = worker('c', 'Cap', 4, [win('Mon', '08:00', '18:00'), win('Tue', '08:00', '18:00')]);
    const result = autoSchedule([cap4], singles, WEEK);
    expect(result.assignments).toHaveLength(2);
    expect(result.open.find((o) => o.shiftId === 'Mon-16')).toEqual({ shiftId: 'Mon-16', missing: 1 });
  });

  it('reports how many slots a two-person shift is missing', () => {
    const twos = standardGrid().filter((s) => s.id === 'Mon-10');
    expect(autoSchedule([], twos, WEEK).open).toEqual([{ shiftId: 'Mon-10', missing: 2 }]);
  });
});
