# Contributing

Thanks for your interest in Platefy. This document explains how changes get into the project.

## How development works

Platefy uses an AI-assisted workflow:

1. The maintainer and [Claude Code](https://claude.com/claude-code) plan a change, usually as a GitHub issue.
2. Claude implements it on a branch and opens a pull request as the `benchbite-bot` GitHub App.
3. The maintainer reviews the pull request and leaves feedback.
4. Claude addresses the feedback with new commits until the pull request is approved.
5. The maintainer squash-merges it into `main`.

The `main` branch is protected: changes require a pull request and an approving review.

## Conventions

The full set of rules lives in [`CLAUDE.md`](CLAUDE.md). In short:

- Everything in the repository is written in English.
- Branches are named `<type>/<short-description>`.
- Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/).
- Commits are small and frequent; each one is a reviewable step.
- Pull requests cover one topic and explain why the change is made.
- Significant decisions are recorded as ADRs in [`docs/adr/`](docs/adr/).

## Reporting bugs and suggesting features

Open an issue using one of the templates. Please search existing issues first.

## Security

Do not open a public issue for security problems. Use
[private vulnerability reporting](https://github.com/Kaandroids/benchbite/security/advisories/new) instead.
