// Shared fixtures. Not a test file (no `.test.` in the name), so Vitest does not run it.
import type { Day, Shift, Window, Worker } from '../src/domain/types.js';
import { RosterService } from '../src/roster/RosterService.js';
import { standardGrid } from '../src/roster/grid.js';
import type { IdSource } from '../src/schedule/ports.js';
import { ScheduleService } from '../src/schedule/ScheduleService.js';
import { InMemoryRepository } from '../src/storage/InMemoryRepository.js';

export const WEEK = '2026-11-16';

export function win(day: Day, start: string, end: string): Window {
  return { day, start, end };
}

export function worker(
  id: string,
  name: string,
  maxHoursPerWeek: number,
  availability: readonly Window[],
): Worker {
  return { id, name, maxHoursPerWeek, availability };
}

export function shift(id: string): Shift {
  const found = standardGrid().find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(`no such shift in the standard grid: ${id}`);
  }
  return found;
}

/** Predictable ids: id-1, id-2, ... */
export function counterIds(): IdSource {
  let n = 0;
  return () => {
    n += 1;
    return `id-${n}`;
  };
}

export interface World {
  readonly repo: InMemoryRepository;
  readonly roster: RosterService;
  readonly schedule: ScheduleService;
}

export function world(workers: readonly Worker[] = []): World {
  const repo = new InMemoryRepository({ workers, shifts: standardGrid(), assignments: [], swaps: [] });
  const ids = counterIds();
  return { repo, roster: new RosterService(repo, ids), schedule: new ScheduleService(repo, ids) };
}
