// The repository used by tests and by the JSON-file repository underneath.
import type { Assignment, Shift, Snapshot, SwapRequest, Worker } from '../domain/types.js';
import type { Repository } from '../schedule/ports.js';

const EMPTY: Snapshot = { workers: [], shifts: [], assignments: [], swaps: [] };

export class InMemoryRepository implements Repository {
  private workers: Worker[];
  private shifts: Shift[];
  private assignments: Assignment[];
  private swaps: SwapRequest[];

  constructor(initial: Snapshot = EMPTY) {
    this.workers = [...initial.workers];
    this.shifts = [...initial.shifts];
    this.assignments = [...initial.assignments];
    this.swaps = [...initial.swaps];
  }

  listWorkers(): readonly Worker[] {
    return this.workers;
  }

  findWorker(id: string): Worker | undefined {
    return this.workers.find((w) => w.id === id);
  }

  saveWorker(worker: Worker): void {
    this.workers = upsert(this.workers, worker);
  }

  listShifts(): readonly Shift[] {
    return this.shifts;
  }

  listAssignments(weekOf: string): readonly Assignment[] {
    return this.assignments.filter((a) => a.weekOf === weekOf);
  }

  replaceAssignments(weekOf: string, assignments: readonly Assignment[]): void {
    const others = this.assignments.filter((a) => a.weekOf !== weekOf);
    this.assignments = [...others, ...assignments];
  }

  listSwaps(): readonly SwapRequest[] {
    return this.swaps;
  }

  findSwap(id: string): SwapRequest | undefined {
    return this.swaps.find((s) => s.id === id);
  }

  saveSwap(swap: SwapRequest): void {
    this.swaps = upsert(this.swaps, swap);
  }

  snapshot(): Snapshot {
    return {
      workers: [...this.workers],
      shifts: [...this.shifts],
      assignments: [...this.assignments],
      swaps: [...this.swaps],
    };
  }
}

/** Replace the item with the same id, or append. Keeps order stable for readable JSON diffs. */
function upsert<T extends { readonly id: string }>(items: readonly T[], item: T): T[] {
  const index = items.findIndex((i) => i.id === item.id);
  if (index === -1) {
    return [...items, item];
  }
  return items.map((i, n) => (n === index ? item : i));
}
