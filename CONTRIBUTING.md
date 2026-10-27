# How we work in this repository

This is the working agreement the project ships with. Your team may extend it,
but not remove anything here.

## Branches and pull requests

- `main` is protected. Nobody pushes to it directly.
- Every change starts from an issue. Create a branch named `<issue-number>-<short-slug>`,
  for example `14-settle-up-rounding`.
- Open a pull request early (draft is fine) and link the issue with `Closes #14` in the
  description. The PR template asks how you tested it -- answer it.
- One teammate who did **not** write the code reviews it, line by line. The reviewer leaves at least one substantive comment or says explicitly why none
  was needed. Approve only when CI is green.
- Squash-merge, delete the branch.

## What CI checks

`npm run check` runs the same three things as the CI workflow:

| Command              | Must                                                   |
| -------------------- | ------------------------------------------------------ |
| `npm run typecheck`  | compile with no errors                                 |
| `npm run lint`       | report 0 errors (complexity <= 10 per function)        |
| `npm test`           | pass every test; `npm run coverage` must stay >= 80% lines |

Do not edit `eslint.config.js` or the coverage thresholds in `vitest.config.ts`.
Do not add `eslint-disable` comments. If a rule is in your way, the code is telling you
something.

## Issues

- The project ships with open issues. They are **unestimated** on purpose -- estimating
  them is the team's first job.
- Every issue you add needs: a one-paragraph description, acceptance criteria as a
  checklist, and a label (`bug`, `feature`, `tech-debt`, `docs`).
- Close an issue only through a merged pull request that references it.

## Commits

Write the subject line as what the commit does: `Reject percent splits that do not sum to 100`,
not `fixed bug`. One logical change per commit.
