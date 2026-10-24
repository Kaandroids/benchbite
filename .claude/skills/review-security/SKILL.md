---
name: review-security
description: Reviews a pull request for security issues, following the OWASP Top 10 and this project's security rules (row level security, secrets, Edge Functions, storage). Use when asked for a security review of a PR, or when review-pr runs it. Takes the PR number.
---

# Review a pull request: security

Review pull request `$ARGUMENTS` for security issues. The repository is public, the app talks to
Supabase directly with the publishable key, and row level security is what keeps one user's data
from another. Design and correctness have their own reviews; stay on security.

## Read first

1. `gh pr view $ARGUMENTS --json title,body,files` and `gh pr diff $ARGUMENTS`.
2. For every changed table, function, policy or bucket: the migrations that define it, so you
   judge the state after this PR, not the diff alone.
3. The "Security" and "Architecture rules" sections of `CLAUDE.md`.

## What to look for

**OWASP Top 10, as it applies here**

- **A01 Broken access control:** a table without row level security, or a policy that lets a user
  reach another user's rows. Policies `to public` or `anon` where `authenticated` was meant.
  `security definer` functions that do not check `auth.uid()` or the owner of what they touch.
  Grants wider than the app needs. Storage policies not bound to the user's own folder.
- **A02 Cryptographic failures:** secrets, tokens or keys in the code, in migrations, in tests or
  in `.env` files other than `.env.example`. The `service_role` key anywhere in the app. Health data
  kept on the device longer than needed.
- **A03 Injection:** SQL built from strings in functions (`execute` with concatenation), missing
  `set search_path = ''` on functions, and unvalidated JSON input to RPCs.
- **A04 Insecure design:** limits the server does not enforce, such as counts, sizes or rates,
  because the app is trusted to stay within them.
- **A05 Security misconfiguration:** Edge Functions without JWT verification or with permissive
  CORS, public buckets, debug settings left on.
- **A06 Vulnerable components:** new dependencies that are unmaintained, unpinned, or pulled from
  an unusual source.
- **A07 Identification and authentication failures:** sessions or tokens handled outside the
  Supabase client, anonymous users able to do what only signed-in users should.
- **A08 Software and data integrity failures:** GitHub Actions not pinned to a commit, scripts
  fetched and run without a checksum.
- **A09 Logging and monitoring failures:** personal or health data in logs or error messages, and
  errors swallowed where they hide an attack.
- **A10 SSRF:** Edge Functions fetching URLs taken from the request.

**Also**

- New tables or columns holding personal or health data: who can read them, and whether they are
  deleted with the account.
- Tests: does the PR add pgTAP tests for each new access rule, including the case of another user
  and of anon?

## Report

Return the findings, most severe first. For each:

- **Severity:** critical (exploitable now), high, medium, or low.
- **Where:** `path:line`.
- **What:** one sentence.
- **How it could be abused:** the concrete steps or request, in one or two sentences.
- **Fix:** the smallest change that closes it.

Report only issues you can trace in the code. A theoretical issue that the code already prevents
is not a finding. If the change is sound, say so in one line and report nothing. Do not change any
files.
