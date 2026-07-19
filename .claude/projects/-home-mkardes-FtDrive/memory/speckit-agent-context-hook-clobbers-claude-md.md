---
name: speckit-agent-context-hook-clobbers-claude-md
description: The speckit agent-context hook replaces everything between SPECKIT markers in CLAUDE.md — feature history must live outside the markers
metadata:
  type: project
---

The `agent-context` speckit extension (`.specify/extensions/agent-context/scripts/bash/update-agent-context.sh`, run automatically after `/speckit-specify` and `/speckit-plan`) replaces the ENTIRE content between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` in `CLAUDE.md` with a 3-line pointer to the current plan.

**Why:** Before feature 007 (2026-07-18), all the "Active feature / Prior feature" sections lived *inside* those markers, so running the hook silently deleted ~146 lines of feature history. It was restored from git and moved *outside* the markers.

**How to apply:** When updating CLAUDE.md for a new feature, keep the hand-maintained "Active feature"/"Prior feature" sections outside the SPECKIT marker block; let the managed block hold only the plan pointer. Also note: the e2e single-deployable backend registers static routes per-file at startup (`@fastify/static` with `wildcard: false`), so after `vite build` changes asset hashes the server must be restarted or new bundles 404 into the SPA fallback.
