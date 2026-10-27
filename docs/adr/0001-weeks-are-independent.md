# ADR 0001: Weeks are independent and rebuilt from standing availability

**Status:** Accepted
**Date:** 2026-10-05

## Context

Dana used to copy last week's grid into this week's and then patch it, which is how
errors survived for a whole term: a worker who dropped a class kept being scheduled into
the window they no longer had. The system needs one source of truth for who can work
when, and a clear answer to "what does `build` start from?".

## Decision

We will treat each week as independent. A worker's availability is a standing weekly
pattern (`Worker.availability`), and `build <weekOf>` always computes the week from that
pattern and the grid, discarding whatever assignments the week already held. Nothing
about week N is read when building week N+1. Assignments carry `weekOf` so that several
weeks can live in one file, but only so that past weeks remain visible.

## Alternatives considered

- **Copy the previous week, then adjust** -- familiar to Dana, but it propagates stale
  assignments and makes "why is this person here?" unanswerable. Can be revisited once
  the rules are trusted (see the `build --from` question in the issue list).
- **Per-date availability (a calendar per worker)** -- more precise, but the forms the
  workers fill in are weekly patterns, and it would make the sample data and the CLI
  far larger than a first version needs.

## Consequences

Easier: the auto-scheduler is a pure function of (workers, shifts, weekOf) and is trivial
to test. Harder: one-off changes such as a day off have no home yet; the only way to skip
a day is to edit the standing window and restore it later. Manual assignments and
accepted swaps are lost if `build` is run again for the same week, so the README warns
about it.
