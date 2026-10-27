// Workers and their availability. Nothing here knows about weeks or assignments.
import { DomainError } from '../domain/errors.js';
import { DAYS, type Day, type Shift, type Window, type Worker } from '../domain/types.js';
import type { IdSource, Repository } from '../schedule/ports.js';
import { toSpan } from '../time/minutes.js';

export function isDay(text: string): text is Day {
  return (DAYS as readonly string[]).includes(text);
}

/** Validate a window: real day, real times, end after start. Returns a clean copy. */
export function checkWindow(window: Window): Window {
  if (!isDay(window.day)) {
    throw new DomainError('INVALID_WINDOW', `Unknown day "${window.day}"; use Mon..Fri`);
  }
  toSpan(window.start, window.end);
  return { day: window.day, start: window.start, end: window.end };
}

export class RosterService {
  constructor(
    private readonly repo: Repository,
    private readonly nextId: IdSource,
  ) {}

  workers(): readonly Worker[] {
    return [...this.repo.listWorkers()].sort((a, b) => a.name.localeCompare(b.name));
  }

  grid(): readonly Shift[] {
    return this.repo.listShifts();
  }

  /** Look a worker up by name (case-insensitive) -- the CLI never shows ids. */
  byName(name: string): Worker {
    const wanted = name.trim().toLowerCase();
    const found = this.repo.listWorkers().find((w) => w.name.toLowerCase() === wanted);
    if (found === undefined) {
      throw new DomainError('WORKER_NOT_FOUND', `No worker named "${name}"`);
    }
    return found;
  }

  addWorker(name: string, maxHoursPerWeek: number): Worker {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new DomainError('WORKER_NOT_FOUND', 'A worker needs a name');
    }
    if (!Number.isInteger(maxHoursPerWeek) || maxHoursPerWeek <= 0) {
      throw new DomainError('INVALID_WINDOW', `Weekly hours must be a positive whole number, got ${maxHoursPerWeek}`);
    }
    const clash = this.repo.listWorkers().find((w) => w.name.toLowerCase() === trimmed.toLowerCase());
    if (clash !== undefined) {
      throw new DomainError('DUPLICATE_WORKER', `There is already a worker named "${clash.name}"`);
    }
    const worker: Worker = { id: this.nextId(), name: trimmed, maxHoursPerWeek, availability: [] };
    this.repo.saveWorker(worker);
    return worker;
  }

  /** Replace a worker's availability for one day; other days are untouched. */
  setAvailability(name: string, day: Day, windows: readonly Window[]): Worker {
    const worker = this.byName(name);
    const cleaned = windows.map(checkWindow);
    if (cleaned.some((w) => w.day !== day)) {
      throw new DomainError('INVALID_WINDOW', `All windows must be for ${day}`);
    }
    const kept = worker.availability.filter((w) => w.day !== day);
    const updated: Worker = { ...worker, availability: [...kept, ...cleaned] };
    this.repo.saveWorker(updated);
    return updated;
  }
}
