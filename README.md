# Deskwatch

Weekly shift scheduling for a student-staffed IT help desk. The desk at Willamette
Technical Institute runs Monday to Friday, 08:00 to 18:00, in two-hour shifts, with
two people on during the busy 10:00 to 14:00 stretch. Deskwatch holds each student
worker's availability and weekly hour cap, builds a schedule for one week at a time,
lets the supervisor adjust it by hand, handles shift swaps between workers, and
reports on coverage (which shifts are still open) and fairness (who is doing how much
of their cap). It is a command-line tool backed by one JSON file.

**This is a fictional system made for teaching.** The institute, the help desk, every
worker and all of the data are invented. Nothing in this repository describes a real
organisation or a real person.

## What you need

Node 20 or newer. Nothing else: there are no runtime dependencies.

## Getting started

```
npm install
npm run check
```

`check` runs the type checker, the linter and the test suite. All three must be green
before a pull request can merge; see `CONTRIBUTING.md`.

## Everyday commands

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run typecheck` | Compile with `tsc`, no output, 0 errors expected          |
| `npm run lint`      | ESLint over `src/` and `tests/` (complexity limit is 10)  |
| `npm test`          | Run the Vitest suite once                                 |
| `npm run coverage`  | Tests plus a coverage report (80% lines, 70% branches)    |
| `npm run build`     | Compile to `dist/`                                        |
| `npm start -- ...`  | Run the CLI from `dist/` (same as `node dist/cli.js ...`) |

The CLI reads and writes `data/sample.json` unless you pass `--file <path>`. The sample
file is committed, so if you want to experiment without dirtying it, copy it first:
`cp data/sample.json data/local.json` and add `--file data/local.json` (that name is
git-ignored).

## Demo walkthrough

Build first (`npm run build`), then run these in order. The sample data holds twelve
workers and the week of Monday 2026-11-16, already scheduled.

1. See who works the desk and when they can be there.

   ```
   $ node dist/cli.js workers
   Name       Cap   Availability
   Caleb      8h    Mon 08:00-12:00, Tue 14:00-18:00, Fri 14:00-18:00
   Dev        6h    Mon 14:00-18:00, Wed 14:00-18:00
   Ellis      12h   Mon 08:00-14:00, Wed 08:00-18:00
   ...
   ```

2. Print the week's grid. Two shifts are still open.

   ```
   $ node dist/cli.js schedule 2026-11-16
   Week of 2026-11-16
               Mon               Tue               Wed               Thu               Fri
   08:00-10:00 Caleb             Noor              Ellis             Marisol           Jun
   10:00-12:00 Theo+Ellis        Marisol+Hana      Priya+Rosa        Rosa+Hana         Wren+Wren
   12:00-14:00 Priya+Rosa        Tomas+Noor        Hana+Ellis        Tomas+Priya       Tomas+Hana
   14:00-16:00 Dev               Caleb             Jun               Theo              Caleb
   16:00-18:00 -- (open)         Tomas             Dev               Noor              -- (open)
   ```

3. The coverage report says the same thing shift by shift.

   ```
   $ node dist/cli.js coverage 2026-11-16
   Shift    Time         Staff  Assigned
   Mon-08   08:00-10:00  1/1    Caleb
   ...
   Mon-16   16:00-18:00  0/1     OPEN
   ...
   Fri-16   16:00-18:00  0/1     OPEN
   ```

4. Dana, the supervisor, knows Marisol will cover Friday evening if asked, even though
   it is outside her posted windows. `--force` overrides availability only; hour caps
   and clashes still apply.

   ```
   $ node dist/cli.js assign 2026-11-16 Fri-16 Marisol --force
   Assigned Marisol to Fri-16 (manual, forced)
   ```

5. A new worker joins mid-term and posts a Monday afternoon.

   ```
   $ node dist/cli.js add-worker Sasha 8
   Added Sasha (cap 8h)
   $ node dist/cli.js avail Sasha Mon 14:00-18:00
   Sasha Mon: 14:00-18:00
   $ node dist/cli.js assign 2026-11-16 Mon-16 Sasha
   Assigned Sasha to Mon-16 (manual)
   ```

6. Theo asks Dev to take his Thursday afternoon. Dev is not available on Thursdays, so
   accepting the request is refused and the schedule is unchanged.

   ```
   $ node dist/cli.js swap 2026-11-16 Thu-14 Theo Dev
   Swap 3f9c2a7e requested: Thu-14 from Theo to Dev (pending)
   $ node dist/cli.js accept 3f9c2a7e
   error: Dev is not available Thu 14:00-16:00
   ```

   (Swap ids are random; use the one the `swap` command printed.)

7. The fairness report shows hours against caps and how evenly the load is spread.

   ```
   $ node dist/cli.js fairness 2026-11-16
   Name       Hours    Utilisation
   Caleb      6/8      75%
   Dev        4/6      67%
   ...
   Utilisation std dev: 0.174
   ```

8. Finally, rebuild the week from scratch. `build` throws away the week's assignments
   (including the manual ones above) and runs the auto-scheduler again. Sasha now
   takes Monday afternoon (Mon-14) and Dev moves to Monday evening (Mon-16); Friday
   evening is still reported open.

   ```
   $ node dist/cli.js build 2026-11-16
   Built week of 2026-11-16: 34 assignments
     open: Fri-16 (1 missing)
   ```

When you are done, `git checkout data/sample.json` puts the sample data back.

## How the code is organised

`src/domain` holds the types and the one error class; `src/time`, `src/roster` and
`src/schedule` hold the rules and the two services; `src/storage` holds the in-memory
and JSON-file repositories; `src/cli.ts` is the only thing that talks to the terminal.
`ARCHITECTURE.md` has the diagrams, the numbered domain rules and the known limitations.

## Where to start

Read `ARCHITECTURE.md`, then `CONTRIBUTING.md` for the branch and review rules. Issues
01 and 02 are small and well-bounded and touch the two halves of the code (a time rule
and a CLI report); pick those up first.
