// The eligibility rules R1-R3 as pure functions. Every caller that decides whether a
// worker may take a shift should come through `canWork` so the rules live in one place.
import type { Assignment, Shift, Worker } from '../domain/types.js';
import { contains, hoursOf, overlaps, toSpan } from '../time/minutes.js';

export type IneligibleCode = 'NOT_AVAILABLE' | 'OVERLAPPING_SHIFT' | 'OVER_CAP';

export interface Ineligible {
  readonly code: IneligibleCode;
  readonly reason: string;
}

export type Verdict = { readonly ok: true } | ({ readonly ok: false } & Ineligible);

const OK: Verdict = { ok: true };

function fail(code: IneligibleCode, reason: string): Verdict {
  return { ok: false, code, reason };
}

/** Hours of one shift. */
export function shiftHours(shift: Shift): number {
  return hoursOf(toSpan(shift.start, shift.end));
}

/** Total hours a worker is assigned in `assignments` (one week's worth). */
export function assignedHours(
  workerId: string,
  assignments: readonly Assignment[],
  shifts: readonly Shift[],
): number {
  return assignments
    .filter((a) => a.workerId === workerId)
    .map((a) => shifts.find((s) => s.id === a.shiftId))
    .filter((s): s is Shift => s !== undefined)
    .reduce((sum, s) => sum + shiftHours(s), 0);
}

/** Sum of a worker's availability windows, in hours. Used as a tie-breaker by R4. */
export function availabilityHours(worker: Worker): number {
  return worker.availability.reduce((sum, w) => sum + hoursOf(toSpan(w.start, w.end)), 0);
}

/** R1: the shift lies entirely inside one of the worker's windows for that day. */
export function isAvailable(worker: Worker, shift: Shift): boolean {
  const span = toSpan(shift.start, shift.end);
  return worker.availability.some(
    (w) => w.day === shift.day && contains(toSpan(w.start, w.end), span),
  );
}

/** R2: the worker holds no other shift on the same day that overlaps this one. */
export function overlapping(
  worker: Worker,
  shift: Shift,
  assignments: readonly Assignment[],
  shifts: readonly Shift[],
): Shift | undefined {
  const span = toSpan(shift.start, shift.end);
  return assignments
    .filter((a) => a.workerId === worker.id && a.shiftId !== shift.id)
    .map((a) => shifts.find((s) => s.id === a.shiftId))
    .find((s) => s !== undefined && s.day === shift.day && overlaps(toSpan(s.start, s.end), span));
}

/**
 * Can `worker` take `shift` given the assignments already made this week?
 * `assignments` should not include the assignment being evaluated (callers filter it out
 * when re-checking an existing one). `ignoreAvailability` is the supervisor's override
 * (R5): it skips R1 only; R2 and R3 still apply.
 */
export function canWork(
  worker: Worker,
  shift: Shift,
  assignments: readonly Assignment[],
  shifts: readonly Shift[],
  options: { readonly ignoreAvailability?: boolean } = {},
): Verdict {
  if (options.ignoreAvailability !== true && !isAvailable(worker, shift)) {
    return fail('NOT_AVAILABLE', `${worker.name} is not available ${shift.day} ${shift.start}-${shift.end}`);
  }
  const clash = overlapping(worker, shift, assignments, shifts);
  if (clash !== undefined) {
    return fail('OVERLAPPING_SHIFT', `${worker.name} already works ${clash.id} (${clash.start}-${clash.end})`);
  }
  const hours = assignedHours(worker.id, assignments, shifts) + shiftHours(shift);
  if (hours > worker.maxHoursPerWeek) {
    return fail('OVER_CAP', `${worker.name} would reach ${hours}h, over the cap of ${worker.maxHoursPerWeek}h`);
  }
  return OK;
}
