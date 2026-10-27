// Everything that happens to one week's schedule: build it, adjust it, swap shifts, report.
import { DomainError } from '../domain/errors.js';
import type { Assignment, Shift, SwapRequest, Worker } from '../domain/types.js';
import { assertWeekOf } from '../time/dates.js';
import { contains, overlaps, toSpan } from '../time/minutes.js';
import { autoSchedule, inGridOrder, type ScheduleResult } from './autoSchedule.js';
import { assignedHours, canWork, type Verdict } from './eligibility.js';
import type { IdSource, Repository } from './ports.js';

export interface CoverageRow {
  readonly shift: Shift;
  readonly required: number;
  readonly assigned: readonly Worker[];
  readonly open: boolean;
}

export interface FairnessRow {
  readonly worker: Worker;
  readonly hours: number;
  readonly cap: number;
  /** hours / cap, 0..1 in a healthy schedule. */
  readonly utilisation: number;
}

export interface FairnessReport {
  readonly rows: readonly FairnessRow[];
  readonly stdDev: number;
}

function reject(verdict: Verdict): void {
  if (!verdict.ok) {
    throw new DomainError(verdict.code, verdict.reason);
  }
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export class ScheduleService {
  constructor(
    private readonly repo: Repository,
    private readonly nextId: IdSource,
  ) {}

  private shift(shiftId: string): Shift {
    const found = this.repo.listShifts().find((s) => s.id === shiftId);
    if (found === undefined) {
      throw new DomainError('SHIFT_NOT_FOUND', `No shift "${shiftId}" on the grid`);
    }
    return found;
  }

  private worker(workerId: string): Worker {
    const found = this.repo.findWorker(workerId);
    if (found === undefined) {
      throw new DomainError('WORKER_NOT_FOUND', `No worker with id ${workerId}`);
    }
    return found;
  }

  /** The week's assignments in grid order, so output is stable. */
  assignments(weekOf: string): readonly Assignment[] {
    const order = inGridOrder(this.repo.listShifts()).map((s) => s.id);
    return [...this.repo.listAssignments(assertWeekOf(weekOf))].sort(
      (a, b) => order.indexOf(a.shiftId) - order.indexOf(b.shiftId),
    );
  }

  /** R4. Replaces whatever the week held before. */
  build(weekOf: string): ScheduleResult {
    assertWeekOf(weekOf);
    const result = autoSchedule(this.repo.listWorkers(), this.repo.listShifts(), weekOf);
    this.repo.replaceAssignments(weekOf, result.assignments);
    return result;
  }

  /** R5. `force` lets the supervisor override availability (R1) but never R2 or R3. */
  assign(weekOf: string, shiftId: string, workerId: string, force = false): Assignment {
    assertWeekOf(weekOf);
    const shift = this.shift(shiftId);
    const worker = this.worker(workerId);
    const current = this.repo.listAssignments(weekOf);
    if (current.some((a) => a.shiftId === shiftId && a.workerId === workerId)) {
      throw new DomainError('ALREADY_ASSIGNED', `${worker.name} already holds ${shiftId}`);
    }
    if (current.filter((a) => a.shiftId === shiftId).length >= shift.requiredStaff) {
      throw new DomainError('SHIFT_FULL', `${shiftId} already has ${shift.requiredStaff} assigned`);
    }
    reject(canWork(worker, shift, current, this.repo.listShifts(), { ignoreAvailability: force }));
    const assignment: Assignment = { shiftId, workerId, weekOf, source: 'manual' };
    this.repo.replaceAssignments(weekOf, [...current, assignment]);
    return assignment;
  }

  unassign(weekOf: string, shiftId: string, workerId: string): void {
    assertWeekOf(weekOf);
    this.shift(shiftId);
    const current = this.repo.listAssignments(weekOf);
    const kept = current.filter((a) => !(a.shiftId === shiftId && a.workerId === workerId));
    if (kept.length === current.length) {
      throw new DomainError('NOT_ASSIGNED', `${this.worker(workerId).name} does not hold ${shiftId}`);
    }
    this.repo.replaceAssignments(weekOf, kept);
  }

  /** R6, first half: record the request. Validity is checked on acceptance. */
  requestSwap(weekOf: string, shiftId: string, fromWorkerId: string, toWorkerId: string): SwapRequest {
    assertWeekOf(weekOf);
    this.shift(shiftId);
    const from = this.worker(fromWorkerId);
    const to = this.worker(toWorkerId);
    if (from.id === to.id) {
      throw new DomainError('NOT_ASSIGNED', `${from.name} cannot swap a shift with themselves`);
    }
    const holds = this.repo
      .listAssignments(weekOf)
      .some((a) => a.shiftId === shiftId && a.workerId === fromWorkerId);
    if (!holds) {
      throw new DomainError('NOT_ASSIGNED', `${from.name} does not hold ${shiftId} that week`);
    }
    const swap: SwapRequest = {
      id: this.nextId(),
      weekOf,
      shiftId,
      fromWorkerId,
      toWorkerId,
      status: 'pending',
    };
    this.repo.saveSwap(swap);
    return swap;
  }

  private pendingSwap(swapId: string): SwapRequest {
    const swap = this.repo.findSwap(swapId);
    if (swap === undefined) {
      throw new DomainError('SWAP_NOT_FOUND', `No swap request ${swapId}`);
    }
    if (swap.status !== 'pending') {
      throw new DomainError('SWAP_NOT_PENDING', `Swap ${swapId} was already ${swap.status}`);
    }
    return swap;
  }

  /** R6, second half: check the receiving worker and move the assignment. */
  acceptSwap(swapId: string): Assignment {
    const swap = this.pendingSwap(swapId);
    const shift = this.shift(swap.shiftId);
    const to = this.worker(swap.toWorkerId);
    const current = this.repo.listAssignments(swap.weekOf);
    const shifts = this.repo.listShifts();
    const span = toSpan(shift.start, shift.end);

    // Availability: the shift must sit inside one of the receiver's windows for that day.
    let available = false;
    for (const window of to.availability) {
      if (window.day === shift.day) {
        const windowSpan = toSpan(window.start, window.end);
        if (contains(windowSpan, span)) {
          available = true;
        }
      }
    }
    if (!available) {
      throw new DomainError(
        'NOT_AVAILABLE',
        `${to.name} is not available ${shift.day} ${shift.start}-${shift.end}`,
      );
    }

    // Clashes: nothing else the receiver already works that day may overlap.
    for (const existing of current.filter((a) => a.workerId === to.id)) {
      if (existing.shiftId !== shift.id) {
        const other = shifts.find((s) => s.id === existing.shiftId);
        if (other !== undefined && other.day === shift.day && overlaps(toSpan(other.start, other.end), span)) {
          throw new DomainError(
            'OVERLAPPING_SHIFT',
            `${to.name} already works ${other.id} (${other.start}-${other.end})`,
          );
        }
      }
    }

    const kept = current.filter((a) => !(a.shiftId === swap.shiftId && a.workerId === swap.fromWorkerId));
    const moved: Assignment = { shiftId: swap.shiftId, workerId: to.id, weekOf: swap.weekOf, source: 'swap' };
    this.repo.replaceAssignments(swap.weekOf, [...kept, moved]);
    this.repo.saveSwap({ ...swap, status: 'accepted' });
    return moved;
  }

  declineSwap(swapId: string): SwapRequest {
    const declined: SwapRequest = { ...this.pendingSwap(swapId), status: 'declined' };
    this.repo.saveSwap(declined);
    return declined;
  }

  swaps(weekOf?: string): readonly SwapRequest[] {
    const all = this.repo.listSwaps();
    return weekOf === undefined ? all : all.filter((s) => s.weekOf === weekOf);
  }

  /** R7. */
  coverage(weekOf: string): CoverageRow[] {
    const current = this.assignments(weekOf);
    return inGridOrder(this.repo.listShifts()).map((shift) => {
      const assigned = current.filter((a) => a.shiftId === shift.id).map((a) => this.worker(a.workerId));
      return { shift, required: shift.requiredStaff, assigned, open: assigned.length < shift.requiredStaff };
    });
  }

  /** R8. Workers with no cap would divide by zero, but addWorker rejects a cap of 0. */
  fairness(weekOf: string): FairnessReport {
    const current = this.assignments(weekOf);
    const shifts = this.repo.listShifts();
    const rows = [...this.repo.listWorkers()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((worker) => {
        const hours = assignedHours(worker.id, current, shifts);
        return { worker, hours, cap: worker.maxHoursPerWeek, utilisation: hours / worker.maxHoursPerWeek };
      });
    return { rows, stdDev: standardDeviation(rows.map((r) => r.utilisation)) };
  }
}
