# VISION

## Why this project exists

Meridian is a **local-first, fully simulated consumer banking platform**. It has
two intertwined goals:

1. **Product:** build a banking experience that *feels* like a polished, modern
   national bank — public website, customer portal, and a companion
   bank-operations console — without ever touching real money or real financial
   systems. It is a sandbox for exploring excellent banking UX, a disciplined
   money model, and realistic operational workflows.

2. **Experiment:** serve as a long-running, milestone-gated study of how an AI
   coding agent (Claude Code) can plan, build, document, and hand off a
   non-trivial software project across many fresh sessions. Here, the **process
   and documentation are first-class deliverables**, equal in importance to the
   running code.

## What "good" looks like

- A reviewer can clone the repo, run a few documented commands, and have all
  three apps running locally on Windows PowerShell or WSL Ubuntu.
- A brand-new Claude Code session, with **zero chat history**, can read the repo
  docs, ingest the human's pasted feedback, and confidently continue from the
  next milestone.
- The product feels trustworthy and real, while being unmistakably labeled a
  simulation everywhere it matters.
- Money is always explainable. Every cent in every balance traces to an explicit
  ledger entry; nothing appears or disappears by magic.
- Each milestone ends in a known-good, runnable state with `npm run verify`
  passing, honest reporting of anything skipped or blocked, and a clean handoff.

## Principles

1. **Truth over polish.** Report real project state. A truthful blocker beats a
   pretend-complete milestone.
2. **Simulation, clearly labeled.** Never imply real banking. Never handle real
   money, credentials, or external services.
3. **Boring, mainstream technology.** Favor stable, well-documented choices so
   future sessions are easy, not clever architecture that ages badly.
4. **Disciplined money.** Derived balances, integer minor units, explicit
   bank-originated events, audited adjustments.
5. **Explainable everything.** Fraud/risk via simple rules (not AI/ML), with
   reasons shown. Sensitive actions audited.
6. **Repo is the source of truth.** Not chat history, not memory. If it isn't in
   the repo, it doesn't exist for the next session.
7. **Serialize the risky parts.** Schema, auth, routing, architecture, CI, and
   repo structure get careful, serialized changes; parallelize only what is
   clearly independent.

## Non-goals

- Real financial functionality, real integrations, or regulatory compliance.
- Production-grade security hardening beyond what a realistic simulation needs
  to be a good teaching/demonstration artifact.
- Mobile-native apps (the web apps are responsive instead).
- Multi-currency, internationalization, or scale/performance beyond a smooth
  local demo (until the final hardening milestone, if at all).

## The fictional brand

**Meridian** — a trustworthy, modern, navigation-themed national-bank brand
(compass mark; navy/teal/white with a gold accent; tagline *"Banking that keeps
you on course."*). It is invented for this simulation and must never be
presented as, or confused with, a real institution.
