# Project Engineering Baseline

**Project**: `open_code` — Independent OpenCode-Based AI Agent Platform  
**Baseline Date**: October 31, 2026  
**Status**: Consolidated Baseline Established  
**Commit**: `f5ffcb524acecad6042f901e3d98550c8c11e4ee`  
**Tracking Branch**: `main` -> `origin/main` (`https://github.com/Beastknight933/open_code.git`)  

---

## 1. Executive Summary

This document establishes the verified, definitive technical baseline for the independent `open_code` agent platform. It synthesizes the repository audit, migration verification, and architectural analysis into an authoritative ground truth for all future development.

The project is an **independent, heavily extended fork of OpenCode** aiming to provide an AI agent development platform comparable to or exceeding Google Antigravity 2.0's agent capabilities while retaining OpenCode's engine, flexibility, and openness.

---

## 2. Verified Repository Identity & Topology

- **Authoritative Workspace Root**: `C:\Users\gaumi\Documents\GitHub\open_code`
- **Git Repository Root**: `C:/Users/gaumi/Documents/GitHub/open_code` (verified via `git rev-parse --show-toplevel`)
- **Current Branch**: `main`
- **Current HEAD Commit**: `f5ffcb524acecad6042f901e3d98550c8c11e4ee`
- **Tracking Remote**: `origin` &rarr; `https://github.com/Beastknight933/open_code.git` (sole authoritative remote)
- **Auxiliary Remotes**: None (auxiliary `opencode` remote permanently purged)
- **Working Tree State**: Clean. Zero uncommitted changes. Zero untracked files outside `docs/audit/`.
- **Package Manager & Runtimes**: Bun `v1.4.4` managing 40 Turborepo packages.

---

## 3. Migration Integrity Assessment

The migration into the independent `open_code` repository was verified:
- **Upstream Codebase Baseline**: Cloned from `origin/dev` at commit `2e29481d5c5b92b75b6a29eeca8a8ff8ed166af7` (Release v2.2.4).
- **Filesystem Integrity**: 9,293 files imported cleanly in commit `786d2969ef`.
- **Custom Integration Integrity**: Commit `36fafa8cf5` and merge `a9bd8bf3c4` / sync `f5ffcb524a` successfully applied all 69 extension files (+11,767 LOC) with **zero upstream file deletions**.
- **Dependencies & Lockfile**: `bun.lock` is fully intact and synchronized; all `node_modules` are resolved.
- **Verification Integrity**:
  - Full TypeScript typecheck passes across all packages (`bun check --no-script`).
  - Desktop baseline regression suite: 235 passed, 0 failed across 40 files.
  - Core unit, acceptance, and integration suites: 54 passed, 0 failed across 13 files.

---

## 4. Current Architectural State

### 4.1 Upstream OpenCode Foundation (Preserved 100%)
- **Streaming Execution Engine**: Decoupled prompt admission into SQLite `session_inbox`, process-local `SessionRunCoordinator`, and step-by-step LLM streaming via `packages/ai`.
- **Model Integrations**: 30+ native provider integrations (Anthropic, OpenAI, Gemini, Bedrock, Azure, Ollama, etc.).
- **Interactive Permissions**: Host permission dialog (`Permission.Service`) gating all tool executions with `ask`, `allow`, and `deny`.
- **Core Native Tools**: `read`, `write`, `edit`, `patch`, `shell`, `skill`, `subagent`, `todo`, `websearch`, `webfetch`.

### 4.2 Enhanced Extension Subsystem
- **Common Intermediate Representation (CIR)**: Defined in `@opencode/schema/extension` for skills, rules, MCP servers, and plugins.
- **Platform Detector & Package Decomposer**: Heuristic identification of external ecosystems (Antigravity, Claude Code, Cursor, Codex) in `packages/core/src/extension/detector.ts`.
- **Static Security Scanner**: AST regex scanner in `packages/core/src/extension/security.ts` guarding against path traversal, destructive commands, and secret leakage.
- **Persistent Extension Registry**: Scoped persistence (`global` vs `project`) in `.opencode/extensions.json` with version rollback.
- **Adapters**: Universal Skills (`skills/adapter.ts`), MCP manager (`mcp/manager.ts`), Rules parser (`rules/adapter.ts`), and Plugin shims (`plugin/adapter.ts`).

### 4.3 Enhanced Workspace Subsystem
- **Dynamic Multi-Folder Workspaces**: Manages multi-drive folder attachments in `.opencode/workspace.json`, primary root switching, path relinking, and unified explorer tree.
- **Safe Project Operations**: Creation, rename, archive, restore, and safe deletion (`deletePhysicalFiles: false` default).
- **Persistent Attachments Engine**: File persistence in `.opencode/attachments/`, MIME categorization, text summaries, and search indexing.
- **Project Conversation Coordinator**: Project-scoped multi-session management atop SQLite `SessionTable`.
- **Fork Data Isolation**: Dedicated configuration path (`~/.config/opencode-enhanced`).

### 4.4 Protocol, Server & UI
- **Server Routes**: Public HttpApi endpoints under `/api/extension/*` and `/api/project/*` in `packages/protocol` and `packages/server`.
- **Client SDK**: Regenerated and strongly typed in `@opencode/client`.
- **UI Settings Shell**: 3 management panels (`ProjectSettingsFolders`, `ProjectSettingsAttachments`, `ProjectSettingsExtensions`) registered in `packages/app/src/settings/shell.tsx`.
- **Native Agent Tools**: `universal_extension`, `workspace_folder`, and `project_attachment` registered in `packages/core/src/plugin/internal.ts`.

---

## 5. Architectural Readiness & Ground Truth

The codebase provides a robust, type-checked, and regression-free baseline. However, as identified in the audit:
- Several capabilities are currently **metadata/inspection-only** and require integration into the active runtime execution loop.
- Release distribution binaries (`dist/`) do not yet exist on disk.
- Antigravity 2.0 autonomous capabilities (reactive wakeup without polling, background tasks, sidecars) remain to be engineered.
