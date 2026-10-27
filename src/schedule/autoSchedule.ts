// R4: fill the grid in order, giving each shift to the eligible worker with the fewest
// hours so far. Pure: no storage, no clock, no ids. The service persists the result.
//
// The selection rule is hard-coded in `pickBest`. A SelectionStrategy interface was
// discussed for preferred shifts and seniority but not built; see ARCHITECTURE.md.
import { DAYS, type Assignment, type Shift, type Worker } from '../domain/types.js';
import { parseTime } from '../time/minutes.js';
import { assignedHours, availabilityHours, canWork } from './eligibility.js';

export interface OpenShift {
  readonly shiftId: string;
  /** How many slots are still empty. */
  readonly missing: number;
}

export interface ScheduleResult {
  readonly assignments: readonly Assignment[];
  readonly open: readonly OpenShift[];
}

/** Grid order: Monday first, then by start time within the day. */
export function inGridOrder(shifts: readonly Shift[]): Shift[] {
  return [...shifts].sort(
    (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || parseTime(a.start) - parseTime(b.start),
  );
}

/** Fewest hours assigned so far, then fewest availability hours, then name. */
function pickBest(
  candidates: readonly Worker[],
  assignments: readonly Assignment[],
  shifts: readonly Shift[],
): Worker | undefined {
  const ranked = [...candidates].sort(
    (a, b) =>
      assignedHours(a.id, assignments, shifts) - assignedHours(b.id, assignments, shifts) ||
      availabilityHours(a) - availabilityHours(b) ||
      a.name.localeCompare(b.name),
  );
  return ranked[0];
}

export function autoSchedule(
  workers: readonly Worker[],
  shifts: readonly Shift[],
  weekOf: string,
): ScheduleResult {
  const assignments: Assignment[] = [];
  const open: OpenShift[] = [];

  for (const shift of inGridOrder(shifts)) {
    const eligible = workers.filter((w) => canWork(w, shift, assignments, shifts).ok);
    let missing = shift.requiredStaff;
    for (let slot = 0; slot < shift.requiredStaff; slot += 1) {
      const worker = pickBest(eligible, assignments, shifts);
      if (worker === undefined) {
        break;
      }
      assignments.push({ shiftId: shift.id, workerId: worker.id, weekOf, source: 'auto' });
      missing -= 1;
    }
    if (missing > 0) {
      open.push({ shiftId: shift.id, missing });
    }
  }
  return { assignments, open };
}
