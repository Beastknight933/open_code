# Remaining Engineering Work & Strategic Roadmap

**Repository**: `open_code`  
**Audit Date**: October 31, 2026  
**Auditor**: Antigravity Technical Pair Programmer  

Based on the empirical audit of the `open_code` repository, this document outlines the exact technical debt, architectural gaps, and implementation tasks required to complete the transformation of OpenCode into a universal AI agent platform with Antigravity 2.0 functional parity.

---

## 1. Prioritized Work Breakdown

```mermaid
graph TD
    subgraph Track 1: Runtime Execution Bridges (P0)
        T1A["MCP Runtime Persistence"]
        T1B["Rules Prompt Injection Pipeline"]
        T1C["Multi-Folder Agent VFS Path Resolution"]
    end

    subgraph Track 2: Extension Execution & Sandboxing (P1)
        T2A["Foreign Plugin VM Sandbox"]
        T2B["Antigravity Multi-Dir Skill Script Runner"]
        T2C["Direct Authenticated GitHub API Ingestion"]
    end

    subgraph Track 3: Antigravity 2.0 Autonomous Experience (P2)
        T3A["Reactive Wakeup & Notification Loop"]
        T3B["Background Tasks & Scheduled Automations"]
        T3C["Autonomous Slash Commands (/goal, /plan)"]
        T3D["Interactive Sidecars & Generative UI"]
    end

    subgraph Track 4: TUI & Distribution Packaging (P3)
        T4A["TUI Multi-Folder Navigation"]
        T4B["Verified Binary Packaging Pipeline (dist/)"]
    end

    T1A --> T2A
    T1B --> T3A
    T1C --> T2B
    T2A --> T3D
    T3A --> T4A
    T3D --> T4B
```

---

## 2. Detailed Technical Action Items

### Track 1: Core Runtime Execution Bridges (Priority: P0 — Critical Path)

1. **MCP Live Runtime Persistence**:
   - *Current State*: `/api/extension/install` saves MCP servers only to `.opencode/extensions.json` via `ExtensionRegistry`.
   - *Required Action*: Extend [`packages/server/src/handlers/extension.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/server/src/handlers/extension.ts) and [`packages/core/src/config/plugin/mcp.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/config/plugin/mcp.ts) so that installing an MCP server updates the active project configuration (`opencode.json` / `config.json`), triggering OpenCode's native `Mcp.Service` to boot the server process immediately.
2. **Rules Prompt Injection Pipeline**:
   - *Current State*: `RulesAdapter` parses `CLAUDE.md`, `.cursorrules`, and `.mdc` rules with precedence, but `ConfigInstructionPlugin` only scans for `AGENTS.md`.
   - *Required Action*: Update [`packages/core/src/config/plugin/instruction.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/config/plugin/instruction.ts) and [`packages/core/src/instruction-discovery.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/instruction-discovery.ts) to call `RulesAdapter.discoverRules(directory)` and inject formatted instructions into the session prompt builder.
3. **Multi-Folder Agent VFS Path Resolution**:
   - *Current State*: Core file tools (`read`, `write`, `edit`, `glob`, `grep`) resolve paths strictly against `location.directory` (the primary project folder).
   - *Required Action*: Update [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts) and tool plugins to query `MultiFolderWorkspace.listFolders(projectID)`. If a relative path does not exist in the primary folder, resolve it across attached secondary roots.

---

### Track 2: Extension Execution & Sandboxing (Priority: P1 — Ecosystem Completeness)

1. **Foreign Plugin Execution Sandbox**:
   - *Current State*: `PluginAdapter` generates JavaScript shims as string templates, but no execution runtime exists.
   - *Required Action*: Implement an isolated execution host (using Node.js `worker_threads` or a sandboxed process boundary) that loads generated plugin shims, exposes OpenCode tool APIs, and enforces `ExtensionSecurity` permissions at runtime.
2. **Antigravity Multi-Directory Skill Runner**:
   - *Current State*: Nested folders (`scripts/`, `references/`) are copied to `.opencode/skills/<id>/`, but execution depends on manual agent shell commands.
   - *Required Action*: Augment `SkillTool` ([`packages/core/src/tool/plugin/skill.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/skill.ts)) to expose skill helper scripts as callable sub-tools or executable actions.
3. **Direct GitHub API Ingestion**:
   - *Current State*: Relies on local `git clone` executions.
   - *Required Action*: Implement GitHub REST API tarball and tree-fetching in [`packages/core/src/extension/github.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/github.ts) with personal access token (PAT) support.

---

### Track 3: Antigravity 2.0 Autonomous Experience (Priority: P2)

1. **Reactive Wakeup & Notification Loop**:
   - Integrate background process and task completions with OpenCode's event bus (`Bus.Service`), waking the session coordinator when background jobs complete without requiring client-side polling.
2. **Autonomous Slash Commands**:
   - Implement state machines for `/goal` (long-running autonomous execution that runs until milestone completion) and `/plan` (hierarchical planning interview).
3. **Interactive Sidecars & Generative UI**:
   - Design an interactive sidecar protocol in `packages/desktop` and `packages/app` allowing web widgets, 3D viewers (e.g. Mol*, Biomolecular), and live web previews to mount in a dedicated side pane.

---

### Track 4: TUI & Distribution Packaging (Priority: P3)

1. **TUI Multi-Folder Navigation**:
   - Extend `packages/tui` to display attached workspace roots, folder status (`active` vs `missing`), and project attachments.
2. **Production Packaging Pipeline Execution**:
   - Execute and verify the desktop bundling scripts (`electron-builder`) and CLI binary compilation (`packages/cli/dist`) on Windows, macOS, and Linux to generate genuine distributable release packages.
