import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { RosterService } from '../src/roster/RosterService.js';
import { ScheduleService } from '../src/schedule/ScheduleService.js';
import { InMemoryRepository } from '../src/storage/InMemoryRepository.js';
import { fromParsed, JsonFileRepository } from '../src/storage/JsonFileRepository.js';
import { counterIds, WEEK, win, worker, world } from './helpers.js';

describe('RosterService', () => {
  it('adds workers, looks them up by name case-insensitively, and lists them sorted', () => {
    const { roster } = world();
    roster.addWorker('Zoe', 8);
    const ana = roster.addWorker('Ana', 10);
    expect(ana).toEqual({ id: 'id-2', name: 'Ana', maxHoursPerWeek: 10, availability: [] });
    expect(roster.byName('ana').id).toBe('id-2');
    expect(roster.workers().map((w) => w.name)).toEqual(['Ana', 'Zoe']);
    expect(roster.grid()).toHaveLength(25);
  });

  it('rejects blank names, bad caps, duplicates and unknown names', () => {
    const { roster } = world();
    roster.addWorker('Ana', 10);
    expect(() => roster.addWorker('  ', 10)).toThrowError(DomainError);
    expect(() => roster.addWorker('Bo', 0)).toThrowError(/positive whole number/);
    expect(() => roster.addWorker('Bo', 2.5)).toThrowError(DomainError);
    expect(() => roster.addWorker('ANA', 6)).toThrowError(/already a worker/);
    expect(() => roster.byName('Nobody')).toThrowError(/No worker named/);
  });

  it('replaces one day of availability and keeps the other days', () => {
    const { roster } = world([worker('a', 'Ana', 10, [win('Mon', '08:00', '12:00'), win('Tue', '08:00', '12:00')])]);
    const updated = roster.setAvailability('Ana', 'Mon', [win('Mon', '14:00', '16:00'), win('Mon', '16:00', '18:00')]);
    expect(updated.availability).toEqual([
      win('Tue', '08:00', '12:00'),
      win('Mon', '14:00', '16:00'),
      win('Mon', '16:00', '18:00'),
    ]);
    expect(roster.byName('Ana').availability).toEqual(updated.availability);
  });

  it('validates windows: known day, real times, matching day', () => {
    const { roster } = world([worker('a', 'Ana', 10, [])]);
    expect(() => roster.setAvailability('Ana', 'Mon', [win('Mon', '12:00', '08:00')])).toThrowError(DomainError);
    expect(() => roster.setAvailability('Ana', 'Mon', [win('Tue', '08:00', '12:00')])).toThrowError(/must be for Mon/);
    expect(() => roster.setAvailability('Ana', 'Mon', [{ day: 'Sun' as 'Mon', start: '08:00', end: '12:00' }]))
      .toThrowError(/Unknown day/);
  });
});

describe('InMemoryRepository', () => {
  it('upserts by id and keeps weeks apart', () => {
    const repo = new InMemoryRepository();
    repo.saveWorker(worker('a', 'Ana', 10, []));
    repo.saveWorker(worker('a', 'Ana', 12, []));
    expect(repo.listWorkers()).toHaveLength(1);
    expect(repo.findWorker('a')?.maxHoursPerWeek).toBe(12);

    repo.replaceAssignments(WEEK, [{ shiftId: 'Mon-08', workerId: 'a', weekOf: WEEK, source: 'auto' }]);
    repo.replaceAssignments('2026-11-23', [{ shiftId: 'Tue-08', workerId: 'a', weekOf: '2026-11-23', source: 'auto' }]);
    repo.replaceAssignments(WEEK, []);
    expect(repo.listAssignments(WEEK)).toEqual([]);
    expect(repo.listAssignments('2026-11-23')).toHaveLength(1);
    expect(repo.snapshot().assignments).toHaveLength(1);
  });
});

describe('JsonFileRepository', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deskwatch-'));
    file = join(dir, 'data.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts from an empty snapshot with the standard grid when the file is missing', () => {
    const repo = new JsonFileRepository(file);
    expect(repo.listWorkers()).toEqual([]);
    expect(repo.listShifts()).toHaveLength(25);
  });

  it('writes every change through and reads it back in a fresh instance', () => {
    const first = new JsonFileRepository(file);
    const roster = new RosterService(first, counterIds());
    const ana = roster.addWorker('Ana', 10);
    const ben = roster.addWorker('Ben', 10);
    roster.setAvailability('Ana', 'Mon', [win('Mon', '08:00', '12:00')]);
    const schedule = new ScheduleService(first, counterIds());
    schedule.assign(WEEK, 'Mon-08', ana.id);
    const swap = schedule.requestSwap(WEEK, 'Mon-08', ana.id, ben.id);

    const second = new JsonFileRepository(file);
    expect(second.findWorker(ana.id)?.availability).toEqual([win('Mon', '08:00', '12:00')]);
    expect(second.listAssignments(WEEK)).toHaveLength(1);
    expect(second.findSwap(swap.id)?.status).toBe('pending');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(second.snapshot());
  });

  it('tolerates a file with some sections missing', () => {
    writeFileSync(file, JSON.stringify({ workers: [worker('a', 'Ana', 10, [])] }));
    const repo = new JsonFileRepository(file);
    expect(repo.listWorkers()).toHaveLength(1);
    expect(repo.listSwaps()).toEqual([]);
    expect(fromParsed(null).shifts).toHaveLength(25);
    expect(fromParsed({ shifts: [] }).shifts).toHaveLength(25);
  });
});
