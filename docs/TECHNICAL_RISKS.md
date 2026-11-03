# Architectural & Technical Risk Assessment

**Repository**: `open_code`  
**Date**: October 31, 2026  
**Auditor**: Antigravity Technical Pair Programmer  

This document identifies, analyzes, and ranks the technical risks, architectural gaps, and potential pitfalls present in the `open_code` codebase. Every risk is assigned a severity, impact rating, and actionable mitigation strategy.

---

## 1. Risk Severity Matrix

| Risk ID | Title | Category | Severity | Impact | Status |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **RISK-01** | MCP Configuration Ingestion Disconnected from Runtime Boot | Disconnected Backend | **CRITICAL** | **HIGH** | Open |
| **RISK-02** | External Rules Ingestion Disconnected from System Prompt | Disconnected Backend | **CRITICAL** | **HIGH** | Open |
| **RISK-03** | Secondary Workspace Roots Invisible to Native File Tools | Incomplete Abstraction | **HIGH** | **HIGH** | **Resolved** |
| **RISK-04** | Foreign Plugin Shims Without Sandboxed Execution Host | Security & Runtime | **HIGH** | **MEDIUM** | Open |
| **RISK-05** | Production Release Binary Claims Exceeding Filesystem Reality | Documentation Gap | **MEDIUM** | **MEDIUM** | Open |
| **RISK-06** | Auxiliary Upstream Git Remote Retention | Operational Safety | **LOW** | **HIGH** | **Resolved** |
| **RISK-07** | Antigravity Multi-File Skills Script Path Ambiguity | Usability / Runtime | **MEDIUM** | **MEDIUM** | Open |

---

## 2. Detailed Technical Risk Profiles

### RISK-01: MCP Configuration Ingestion Disconnected from Runtime Boot
- **Location**: [`packages/server/src/handlers/extension.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/server/src/handlers/extension.ts#L198-L218)
- **Nature of Defect**: `UniversalMcpManager` parses external Claude Desktop (`claude_desktop_config.json`) and Cursor configurations into `Mcp.ServerConfig`. However, when `/api/extension/install` executes for an MCP category, it saves the entry strictly into `ExtensionRegistry` (`.opencode/extensions.json`). It **fails to update the active OpenCode configuration** (`opencode.json` / `ConfigMcpPlugin`).
- **Consequence**: The user sees the MCP server listed as "installed" in the Customization Center UI, but the server process never launches, no tools are discovered, and the LLM runner has zero access to the server's capabilities.
- **Mitigation Strategy**: Update the install handler to persist the configuration directly into `opencode.json` (or `.opencode/mcp.json`) and trigger `Mcp.Service.reload()`.

---

### RISK-02: External Rules Ingestion Disconnected from System Prompt
- **Location**: [`packages/core/src/config/plugin/instruction.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/config/plugin/instruction.ts#L41-L87) and [`packages/core/src/instruction-discovery.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/instruction-discovery.ts)
- **Nature of Defect**: `RulesAdapter` parses `.cursorrules`, `CLAUDE.md`, and `.cursor/rules/*.mdc` files, extracting frontmatter and globs. However, upstream OpenCode's instruction loader exclusively searches for `AGENTS.md`. `RulesAdapter` is not connected to `ConfigInstructionPlugin`.
- **Consequence**: Users importing or maintaining `CLAUDE.md` or `.cursorrules` will find their instructions completely ignored by the LLM during conversation turns.
- **Mitigation Strategy**: Wire `RulesAdapter.discoverRules` directly into `InstructionDiscovery`, merging detected rules with `AGENTS.md` based on declared precedence.

---

### RISK-03: Secondary Workspace Roots Invisible to Native File Tools [RESOLVED]
- **Location**: [`packages/core/src/file-access.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/file-access.ts) and [`packages/core/src/tool/plugin/read.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/read.ts)
- **Nature of Defect**: `MultiFolderWorkspace` tracks attached roots in `.opencode/workspace.json`, and the `workspace_folder` tool lists them. Previously, native file tools (`read`, `write`, `edit`, `patch`, `glob`, `grep`) resolved relative paths strictly against `Location.directory` (the primary project folder).
- **Consequence**: When working across a multi-repository project, relative file operations against secondary roots failed, forcing manual absolute paths.
- **Resolution**: Integrated `MultiFolderWorkspace` across `FileAccess.resolve`, `search.ts`, and all six file tools with deterministic ambiguity detection, root-qualified addressing, traversal security guards, intermediate symlink verification, and 22 passing integration test scenarios.

---

### RISK-04: Foreign Plugin Shims Without Sandboxed Execution Host
- **Location**: [`packages/core/src/extension/plugin/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/plugin/adapter.ts#L57-L126)
- **Nature of Defect**: `PluginAdapter` synthesizes JavaScript shim templates (`generateAntigravityShim`), but there is no runtime worker, VM sandbox, or loader to execute them. If executed directly inside the host server process, malicious or buggy plugins could crash the daemon or compromise user data.
- **Consequence**: Plugin compatibility is currently superficial (metadata only). Executing unvetted foreign code without a process boundary violates the security charter.
- **Mitigation Strategy**: Implement an isolated worker thread or subprocess sandbox with strict IPC boundaries and permission enforcement.

---

### RISK-05: Production Release Binary Claims Exceeding Filesystem Reality
- **Location**: [`FINAL_DELIVERY_REPORT.md`](file:///c:/Users/gaumi/Documents/GitHub/open_code/FINAL_DELIVERY_REPORT.md#L49-L69) vs. Filesystem `dist/`
- **Nature of Defect**: Project delivery documentation recorded compiled binaries (`dist/desktop/app/OpenCode Dev.exe` and `packages/cli/dist/`), but these directories are absent from the repository disk.
- **Consequence**: Violates Core Principle 5 (*"Never claim compatibility without actual validation"*). Anyone relying on documentation would expect pre-built executables.
- **Mitigation Strategy**: Correct documentation to distinguish packaging configuration readiness from actual compiled release artifacts. Execute packaging build scripts when release artifacts are explicitly required.

---

### RISK-06: Auxiliary Upstream Git Remote Retention
- **Location**: `.git/config` (previously configured remote `opencode`)
- **Nature of Defect**: An auxiliary remote pointing to a local upstream clone was configured in Git.
- **Resolution**: Permanently removed via `git remote remove opencode`. Verified that `origin` (`https://github.com/Beastknight933/open_code.git`) is the sole configured remote with zero push refspec leaks.

---

### RISK-07: Antigravity Multi-File Skills Script Path Ambiguity
- **Location**: [`packages/core/src/tool/plugin/skill.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/skill.ts)
- **Nature of Defect**: Antigravity skills often include executable Python/Bash scripts in `scripts/`. OpenCode's `SkillTool` injects the markdown text of `SKILL.md` into the prompt, but provides no structured way for the agent to know the absolute path of the installed script on disk.
- **Consequence**: The agent attempts to run `python scripts/helper.py` relative to the workspace root and fails because the script is stored in `.opencode/skills/<id>/scripts/`.
- **Mitigation Strategy**: Inject an environment variable or explicit path placeholder (e.g. `$SKILL_DIR`) when materializing skill instructions in the session prompt.
