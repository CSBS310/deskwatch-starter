// Ports: the interfaces the services depend on. Storage and id generation are injected so
// tests can run entirely in memory and so the CLI can swap in the JSON file.
import type { Assignment, Shift, Snapshot, SwapRequest, Worker } from '../domain/types.js';

export interface Repository {
  listWorkers(): readonly Worker[];
  findWorker(id: string): Worker | undefined;
  /** Insert or replace by id. */
  saveWorker(worker: Worker): void;

  listShifts(): readonly Shift[];

  listAssignments(weekOf: string): readonly Assignment[];
  /** Replace every assignment for one week. Weeks are independent, so this is all we need. */
  replaceAssignments(weekOf: string, assignments: readonly Assignment[]): void;

  listSwaps(): readonly SwapRequest[];
  findSwap(id: string): SwapRequest | undefined;
  /** Insert or replace by id. */
  saveSwap(swap: SwapRequest): void;

  snapshot(): Snapshot;
}

/** Where new ids come from. Tests pass a counter; the CLI passes `randomUUID`. */
export type IdSource = () => string;
