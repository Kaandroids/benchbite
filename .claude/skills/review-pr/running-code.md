# Running the code during a review

The review skills read the code first, then run it where running shows more than reading: a SQL
function with an edge case, a race between two calls, a test that may pass without testing the
change. They never change files, never post to GitHub, and never change the main checkout.

## Where the code is

`review-pr` gives each review the path of a worktree with the PR's branch checked out. Read and
run the code there. Without one, read the PR with `gh pr diff` and `gh pr view`, and run nothing
that needs the branch. Never run `git checkout` or `git switch` in the main checkout.

Run a PR's code only when `review-pr` says to: it does so only for the project's own pull
requests. A PR from a fork or from anyone else is read, never run, as its tests, scripts or
migrations may be written to do harm on this machine.

## The database

The local Supabase stack runs in Docker. Reach Postgres with:

```bash
docker exec -i $(docker ps --format '{{.Names}}' | grep supabase_db | head -1) psql -U postgres
```

- Try things only inside a transaction you roll back: `begin; … rollback;`. Sign in as a user
  inside it the way the pgTAP tests do: `set_config('role', 'authenticated', true)` and
  `set_config('request.jwt.claims', …, true)`.
- Run one pgTAP file: pipe it into the command above with `-At -q`, and look for `not ok` lines.
- The stack may lag behind the branch: a migration of the PR may not be applied. Apply it only
  inside your rolled-back transaction, unless it adds enum values, which cannot be used in the
  same transaction; then read instead.
- Never run `supabase db reset`, never apply migrations for good, and never touch the rows of the
  dev account `dev@benchbite.local`.

## Edge Functions

From the worktree's `supabase/functions` folder, run one test file:

```bash
deno test --allow-read=. <function>/<file>_test.ts
```

## The app

From the worktree, run the Jest tests of one folder or file: `pnpm test -- src/<folder>`.
