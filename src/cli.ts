#!/usr/bin/env node
// Command-line front end. Parses argv by hand, one small handler per command.
// Usage: node dist/cli.js <command> [args] [--file data/other.json]
import { randomUUID } from 'node:crypto';
import { isDomainError } from './domain/errors.js';
import { DAYS, type Day, type Window } from './domain/types.js';
import { isDay, RosterService } from './roster/RosterService.js';
import { ScheduleService } from './schedule/ScheduleService.js';
import { JsonFileRepository } from './storage/JsonFileRepository.js';

const DEFAULT_FILE = 'data/sample.json';

interface Context {
  readonly roster: RosterService;
  readonly schedule: ScheduleService;
  readonly args: readonly string[];
  readonly flags: ReadonlySet<string>;
}

const USAGE = `Deskwatch -- weekly shift scheduling for the help desk
  workers | add-worker <name> <maxHours> | avail <name> <Mon..Fri> 08:00-12:00 [more]
  build <weekOf> | schedule <weekOf> | assign <weekOf> <shiftId> <name> [--force]
  swap <weekOf> <shiftId> <from> <to> | accept <swapId> | decline <swapId>
  coverage <weekOf> | fairness <weekOf>
Options: --file <path>   use another JSON file (default ${DEFAULT_FILE})`;

function pad(text: string, width: number): string {
  return text.padEnd(width);
}

function needArgs(ctx: Context, count: number, usage: string): void {
  if (ctx.args.length < count) {
    throw new Error(`Usage: ${usage}`);
  }
}

function parseDay(text: string): Day {
  if (!isDay(text)) {
    throw new Error(`Unknown day "${text}"; use one of ${DAYS.join(', ')}`);
  }
  return text;
}

// Splits '08:00-12:00' into a window. The time check here repeats what minutes.ts does;
// it only exists so a typo is reported before the roster service sees it.
function parseRange(day: Day, text: string): Window {
  const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(text);
  if (match === null) {
    throw new Error(`Expected a range like 08:00-12:00, got "${text}"`);
  }
  return { day, start: match[1], end: match[2] };
}

function cmdWorkers(ctx: Context): void {
  console.log(`${pad('Name', 10)} ${pad('Cap', 5)} Availability`);
  for (const worker of ctx.roster.workers()) {
    const windows = DAYS.flatMap((day) =>
      worker.availability.filter((w) => w.day === day).map((w) => `${day} ${w.start}-${w.end}`),
    );
    console.log(`${pad(worker.name, 10)} ${pad(`${worker.maxHoursPerWeek}h`, 5)} ${windows.join(', ')}`);
  }
}

function cmdAddWorker(ctx: Context): void {
  needArgs(ctx, 2, 'add-worker <name> <maxHours>');
  const worker = ctx.roster.addWorker(ctx.args[0], Number(ctx.args[1]));
  console.log(`Added ${worker.name} (cap ${worker.maxHoursPerWeek}h)`);
}

function cmdAvail(ctx: Context): void {
  needArgs(ctx, 3, 'avail <name> <Mon..Fri> 08:00-12:00 [more ranges]');
  const day = parseDay(ctx.args[1]);
  const windows = ctx.args.slice(2).map((range) => parseRange(day, range));
  const worker = ctx.roster.setAvailability(ctx.args[0], day, windows);
  console.log(`${worker.name} ${day}: ${windows.map((w) => `${w.start}-${w.end}`).join(', ')}`);
}

function cmdBuild(ctx: Context): void {
  needArgs(ctx, 1, 'build <weekOf>');
  const result = ctx.schedule.build(ctx.args[0]);
  console.log(`Built week of ${ctx.args[0]}: ${result.assignments.length} assignments`);
  for (const open of result.open) {
    console.log(`  open: ${open.shiftId} (${open.missing} missing)`);
  }
}

function cmdSchedule(ctx: Context): void {
  needArgs(ctx, 1, 'schedule <weekOf>');
  const rows = ctx.schedule.coverage(ctx.args[0]);
  const starts = [...new Set(rows.map((r) => r.shift.start))];
  console.log(`Week of ${ctx.args[0]}`);
  console.log(`${pad('', 12)}${DAYS.map((d) => pad(d, 18)).join('')}`);
  for (const start of starts) {
    const cells = DAYS.map((day) => {
      const row = rows.find((r) => r.shift.day === day && r.shift.start === start);
      const names = row === undefined ? [] : row.assigned.map((w) => w.name);
      const text = names.length === 0 ? '--' : names.join('+');
      return pad(row?.open === true ? `${text} (open)` : text, 18);
    });
    const end = rows.find((r) => r.shift.start === start)?.shift.end ?? '';
    console.log(`${pad(`${start}-${end}`, 12)}${cells.join('')}`);
  }
}

function cmdAssign(ctx: Context): void {
  needArgs(ctx, 3, 'assign <weekOf> <shiftId> <name> [--force]');
  const worker = ctx.roster.byName(ctx.args[2]);
  const a = ctx.schedule.assign(ctx.args[0], ctx.args[1], worker.id, ctx.flags.has('--force'));
  console.log(`Assigned ${worker.name} to ${a.shiftId} (${a.source}${ctx.flags.has('--force') ? ', forced' : ''})`);
}

function cmdSwap(ctx: Context): void {
  needArgs(ctx, 4, 'swap <weekOf> <shiftId> <from> <to>');
  const from = ctx.roster.byName(ctx.args[2]);
  const to = ctx.roster.byName(ctx.args[3]);
  const swap = ctx.schedule.requestSwap(ctx.args[0], ctx.args[1], from.id, to.id);
  console.log(`Swap ${swap.id} requested: ${swap.shiftId} from ${from.name} to ${to.name} (pending)`);
}

function cmdAccept(ctx: Context): void {
  needArgs(ctx, 1, 'accept <swapId>');
  const moved = ctx.schedule.acceptSwap(ctx.args[0]);
  const name = ctx.roster.workers().find((w) => w.id === moved.workerId)?.name;
  console.log(`Swap ${ctx.args[0]} accepted: ${moved.shiftId} now held by ${name} (${moved.source})`);
}

function cmdDecline(ctx: Context): void {
  needArgs(ctx, 1, 'decline <swapId>');
  const swap = ctx.schedule.declineSwap(ctx.args[0]);
  console.log(`Swap ${swap.id} declined; ${swap.shiftId} is unchanged`);
}

function cmdCoverage(ctx: Context): void {
  needArgs(ctx, 1, 'coverage <weekOf>');
  console.log(`${pad('Shift', 8)} ${pad('Time', 12)} ${pad('Staff', 6)} Assigned`);
  for (const row of ctx.schedule.coverage(ctx.args[0])) {
    const names = row.assigned.map((w) => w.name).join(', ');
    const status = row.open ? ' OPEN' : '';
    const time = `${row.shift.start}-${row.shift.end}`;
    console.log(`${pad(row.shift.id, 8)} ${pad(time, 12)} ${pad(`${row.assigned.length}/${row.required}`, 6)} ${names}${status}`);
  }
}

function cmdFairness(ctx: Context): void {
  needArgs(ctx, 1, 'fairness <weekOf>');
  const report = ctx.schedule.fairness(ctx.args[0]);
  console.log(`${pad('Name', 10)} ${pad('Hours', 8)} Utilisation`);
  for (const row of report.rows) {
    const flag = row.hours > row.cap ? '  OVER CAP' : '';
    console.log(`${pad(row.worker.name, 10)} ${pad(`${row.hours}/${row.cap}`, 8)} ${Math.round(row.utilisation * 100)}%${flag}`);
  }
  console.log(`Utilisation std dev: ${report.stdDev.toFixed(3)}`);
}

const COMMANDS: Record<string, (ctx: Context) => void> = {
  workers: cmdWorkers,
  'add-worker': cmdAddWorker,
  avail: cmdAvail,
  build: cmdBuild,
  schedule: cmdSchedule,
  assign: cmdAssign,
  swap: cmdSwap,
  accept: cmdAccept,
  decline: cmdDecline,
  coverage: cmdCoverage,
  fairness: cmdFairness,
};

/** Split argv into positional args, boolean flags, and the --file option. */
function parseArgv(argv: readonly string[]): { command: string; args: string[]; flags: Set<string>; file: string } {
  const args: string[] = [];
  const flags = new Set<string>();
  let file = DEFAULT_FILE;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--file') {
      file = argv[i + 1] ?? file;
      i += 1;
    } else if (token.startsWith('--')) {
      flags.add(token);
    } else {
      args.push(token);
    }
  }
  const [command = 'help', ...rest] = args;
  return { command, args: rest, flags, file };
}

export function main(argv: readonly string[]): number {
  const { command, args, flags, file } = parseArgv(argv);
  const handler = COMMANDS[command];
  if (handler === undefined) {
    console.log(USAGE);
    return command === 'help' ? 0 : 2;
  }
  const repo = new JsonFileRepository(file);
  const nextId = (): string => randomUUID().slice(0, 8);
  const ctx: Context = { roster: new RosterService(repo, nextId), schedule: new ScheduleService(repo, nextId), args, flags };
  try {
    handler(ctx);
    return 0;
  } catch (e) {
    if (!isDomainError(e) && !(e instanceof Error)) {
      throw e;
    }
    console.error(`error: ${e.message}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
