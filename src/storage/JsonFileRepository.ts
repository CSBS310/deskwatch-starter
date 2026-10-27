// One JSON file holds the whole snapshot. Reads it once, keeps it in memory, and writes
// the whole thing back after every change -- fine for one desk and a dozen workers.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Assignment, Snapshot, SwapRequest, Worker } from '../domain/types.js';
import { standardGrid } from '../roster/grid.js';
import type { Repository } from '../schedule/ports.js';
import { InMemoryRepository } from './InMemoryRepository.js';

type Partial = { [K in keyof Snapshot]?: Snapshot[K] };

/** Fill in anything the file leaves out; a missing grid gets the standard one. */
export function fromParsed(parsed: unknown): Snapshot {
  const p = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Partial;
  return {
    workers: p.workers ?? [],
    shifts: p.shifts !== undefined && p.shifts.length > 0 ? p.shifts : standardGrid(),
    assignments: p.assignments ?? [],
    swaps: p.swaps ?? [],
  };
}

export class JsonFileRepository implements Repository {
  private readonly memory: InMemoryRepository;

  constructor(private readonly path: string) {
    const initial = existsSync(path) ? fromParsed(JSON.parse(readFileSync(path, 'utf8'))) : fromParsed({});
    this.memory = new InMemoryRepository(initial);
  }

  private flush(): void {
    writeFileSync(this.path, `${JSON.stringify(this.memory.snapshot(), null, 2)}\n`);
  }

  listWorkers(): readonly Worker[] {
    return this.memory.listWorkers();
  }

  findWorker(id: string): Worker | undefined {
    return this.memory.findWorker(id);
  }

  saveWorker(worker: Worker): void {
    this.memory.saveWorker(worker);
    this.flush();
  }

  listShifts() {
    return this.memory.listShifts();
  }

  listAssignments(weekOf: string): readonly Assignment[] {
    return this.memory.listAssignments(weekOf);
  }

  replaceAssignments(weekOf: string, assignments: readonly Assignment[]): void {
    this.memory.replaceAssignments(weekOf, assignments);
    this.flush();
  }

  listSwaps(): readonly SwapRequest[] {
    return this.memory.listSwaps();
  }

  findSwap(id: string): SwapRequest | undefined {
    return this.memory.findSwap(id);
  }

  saveSwap(swap: SwapRequest): void {
    this.memory.saveSwap(swap);
    this.flush();
  }

  snapshot(): Snapshot {
    return this.memory.snapshot();
  }
}
