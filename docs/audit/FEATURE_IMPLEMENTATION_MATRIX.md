# Feature Implementation Status Matrix

**Repository**: `open_code`  
**Audit Date**: October 31, 2026  
**Auditor**: Antigravity Technical Pair Programmer  

This document provides a line-item audit of every feature outlined in the Master Project Specification, tracing its implementation status from the User Interface through the Backend Protocol to Core Services and Data Persistence.

---

## 1. Status Classification Definitions

- **VERIFIED**: Fully implemented in code, connected across UI/API/Core/DB, and verified by passing unit/acceptance tests.
- **NEEDS-TESTING**: Implemented across layers, but lacks real-world or interactive integration testing.
- **PARTIAL**: Implementation exists in parts (e.g. parser or UI exists), but is not connected to the active runtime execution loop.
- **DOCUMENTED-ONLY**: Claimed or described in documentation/specs, but code/binaries do not exist on disk.
- **MISSING**: Not implemented in the codebase.
- **REGRESSED**: Feature was previously functional but is now failing tests or broken.

---

## 2. Universal Agent Compatibility Layer

| Feature / Capability | Status | UI Surface | API / Protocol Endpoint | Core Service Implementation | Persistence | Verification Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Common Intermediate Representation (CIR)** | **VERIFIED** | [`project-extensions.tsx`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/app/src/settings/workspaces/project-extensions.tsx) | `@opencode/protocol/groups/extension.ts` | [`packages/schema/src/extension.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/schema/src/extension.ts) | Memory / JSON | `test/extension/milestone1.test.ts` |
| **Platform Detection** | **VERIFIED** | None (internal) | `POST /api/extension/inspect` | [`packages/core/src/extension/detector.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/detector.ts) | None (stateless) | `test/extension/detector.test.ts` |
| **Bundle Decomposition** | **VERIFIED** | Inspect Modal in UI | `POST /api/extension/inspect` | `detector.ts:decomposePackage` | Memory / JSON | `test/extension/milestone1.test.ts` |
| **Static Security Scanner** | **VERIFIED** | Security report badge | Internal check during install | [`packages/core/src/extension/security.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/security.ts) | SecurityReport | `test/extension/security.test.ts` |
| **Extension Registry & Scoping** | **NEEDS-TESTING** | Extension list & tabs | `GET /api/extension`, `POST /api/extension/install` | [`packages/core/src/extension/registry.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/registry.ts) | `.opencode/extensions.json` | `milestone1.test.ts`, `milestone4-integration.test.ts` |
| **Atomic Version Rollback** | **NEEDS-TESTING** | Rollback Button | `POST /api/extension/:id/rollback` | `registry.ts:rollback` | `.opencode/extensions.json` | `milestone1.test.ts` |
| **Skills Ingestion (Multi-Dir)** | **NEEDS-TESTING** | Skills Tab in Settings | `POST /api/extension/install` | [`packages/core/src/extension/skills/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/skills/adapter.ts) | `.opencode/skills/<id>/` | `test/extension/skills.test.ts` |
| **Skills Execution in Session** | **PARTIAL** | Session Chat | `POST /api/session/:id/prompt` | [`packages/core/src/tool/plugin/skill.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/skill.ts) | Filesystem | *Partially tested in core unit tests; multi-file execution not tested* |
| **MCP Config Import (Claude/Cursor)** | **VERIFIED** | MCP Tab in Settings | Internal importer | [`packages/core/src/extension/mcp/manager.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/mcp/manager.ts) | `Mcp.ServerConfig` | `test/extension/mcp.test.ts` |
| **MCP Live Diagnostics & Latency** | **VERIFIED** | Test Button in UI | `POST /api/extension/mcp/test` | `manager.ts:testServer` | Diagnostic output | `test/extension/milestone1.test.ts` |
| **MCP Runtime Persistence** | **PARTIAL** | Installed badge | `POST /api/extension/install` | Missing write to `ConfigMcpPlugin` | Registry only | *Gap: Registry records MCP, but active runtime runner doesn't boot it* |
| **Rules Parsing (AGENTS/CLAUDE/MDC)** | **VERIFIED** | Rules Tab in Settings | Internal parser | [`packages/core/src/extension/rules/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/rules/adapter.ts) | Memory | `test/extension/rules.test.ts` |
| **Rules Prompt Injection** | **PARTIAL** | None | Prompt generation | Missing hook in `ConfigInstructionPlugin` | Memory | *Gap: RulesAdapter not hooked into instruction discovery pipeline* |
| **Plugin Manifest Analysis** | **VERIFIED** | Plugins Tab in UI | `POST /api/extension/inspect` | [`packages/core/src/extension/plugin/adapter.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/extension/plugin/adapter.ts) | InspectionReport | `test/extension/milestone1.test.ts` |
| **Plugin Compatibility Shims** | **PARTIAL** | Proposed Adapter view | `POST /api/extension/adapter/propose` | `adapter.ts:generateAntigravityShim` | String template | *Gap: Template generated, but no runtime VM sandbox or loader executes it* |
| **Agent Tool: universal_extension** | **VERIFIED** | Agent session | Direct tool call | [`packages/core/src/tool/plugin/universal-extension.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/universal-extension.ts) | `ExtensionRegistry` | `milestone4-integration.test.ts` |

---

## 3. Workspace & Project Management Subsystem

| Feature / Capability | Status | UI Surface | API / Protocol Endpoint | Core Service Implementation | Persistence | Verification Test |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Create Project** | **VERIFIED** | Project selector | `POST /api/project` | [`packages/core/src/workspace-manager/project.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/project.ts) | SQLite `ProjectTable` | `test/workspace-manager/acceptance.test.ts` |
| **Rename Project** | **VERIFIED** | Project settings | `PATCH /api/project/:id` | `project.ts:rename` | SQLite `ProjectTable` | `test/workspace-manager/acceptance.test.ts` |
| **Archive / Restore Project** | **VERIFIED** | Project menu | `POST /api/project/:id/archive`, `restore` | `project.ts:archive`, `restore` | SQLite `ProjectTable` | `test/workspace-manager/acceptance.test.ts` |
| **Safe Project Deletion** | **VERIFIED** | Delete dialog | `DELETE /api/project/:id` | `project.ts:delete` | SQLite `ProjectTable` | `test/workspace-manager/acceptance.test.ts` |
| **Attach Secondary Folders** | **VERIFIED** | Folders Tab in UI | `POST /api/project/:id/folders` | [`packages/core/src/workspace-manager/multi-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/multi-folder.ts) | `.opencode/workspace.json` | `test/workspace-manager/acceptance.test.ts` |
| **Detach Individual Folder** | **VERIFIED** | Detach Button | `DELETE /api/project/:id/folders` | `multi-folder.ts:removeFolder` | `.opencode/workspace.json` | `test/workspace-manager/acceptance.test.ts` |
| **Switch Primary Root** | **VERIFIED** | Set Primary Button | `POST /api/project/:id/folders/primary` | `multi-folder.ts:setPrimary` | `.opencode/workspace.json` + DB | `test/workspace-manager/acceptance.test.ts` |
| **Relink Moved Folder** | **VERIFIED** | Relink Dialog | `POST /api/project/:id/folders/relink` | `multi-folder.ts:relinkFolder` | `.opencode/workspace.json` | `test/workspace-manager/acceptance.test.ts` |
| **Unified Tree Explorer** | **VERIFIED** | Folder Tree in UI | Internal / tool tree | `multi-folder.ts:getUnifiedTree` | Filesystem scan | `test/workspace-manager/workspace-manager.test.ts` |
| **Multi-Folder VFS Tool Resolution** | **PARTIAL** | Agent file tools | `read`, `write`, `glob`, `grep` | `Location.directory` (primary only) | Filesystem | *Gap: Relative paths in secondary folders not resolved by file tools* |
| **Agent Tool: workspace_folder** | **VERIFIED** | Agent session | Direct tool call | [`packages/core/src/tool/plugin/workspace-folder.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/workspace-folder.ts) | `MultiFolderWorkspace` | `milestone4-integration.test.ts` |
| **Persistent Attachments Storage** | **VERIFIED** | Attachments Tab | `POST /api/project/:id/attachments` | [`packages/core/src/workspace-manager/attachments.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/attachments.ts) | `.opencode/attachments/` | `test/workspace-manager/acceptance.test.ts` |
| **Attachment MIME & Summary** | **VERIFIED** | Preview Modal | `attachments.ts:categorizeMime` | `attachments.ts:extractSummary` | `index.json` | `test/workspace-manager/workspace-manager.test.ts` |
| **Attachment Full-Text Search** | **VERIFIED** | Search bar in UI | `GET /api/project/:id/attachments?q=` | `attachments.ts:search` | Substring index | `test/workspace-manager/workspace-manager.test.ts` |
| **Agent Tool: project_attachment** | **VERIFIED** | Agent session | Direct tool call | [`packages/core/src/tool/plugin/attachment.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/tool/plugin/attachment.ts) | `ProjectAttachments` | `milestone4-integration.test.ts` |
| **Multi-Conversation Coordinator** | **VERIFIED** | Session list | `GET/POST /api/project/:id/conversations`| [`packages/core/src/workspace-manager/conversations.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/conversations.ts) | SQLite `SessionTable` | `test/workspace-manager/acceptance.test.ts` |
| **Fork Data Isolation** | **NEEDS-TESTING**| Environment paths | Path resolution | [`packages/core/src/workspace-manager/config-migration.ts`](file:///c:/Users/gaumi/Documents/GitHub/open_code/packages/core/src/workspace-manager/config-migration.ts) | `~/.config/opencode-enhanced` | `test/workspace-manager/config-migration.test.ts` |

---

## 4. Antigravity 2.0 Feature Parity Matrix

| Antigravity 2.0 Feature | OpenCode Status | Current Implementation State | Architectural Remediation Required |
| :--- | :--- | :--- | :--- |
| **Multi-directory Skills** | **PARTIAL** | Ingests folder structures to `.opencode/skills/<id>/` | Needs runtime execution of nested scripts by agent shell |
| **Interactive Sidecars** | **MISSING** | No sidecar viewer panel in desktop app | Implement sidecar host & viewer protocol |
| **Reactive Wakeup / No Polling** | **PARTIAL** | `SessionRunCoordinator` coalesces prompts | Background process wakeups need notification bus integration |
| **Autonomous Slash Commands** | **MISSING** | Commands exist in markdown files (`.opencode/command/`) | Implement autonomous state machines for `/goal` and `/plan` |
| **Background Scheduled Tasks** | **MISSING** | No recurring cron engine in core | Implement persistent scheduler daemon |
| **Generative UI / HTML Widgets** | **MISSING** | No inline HTML/Widget renderer in SolidJS chat | Implement sandboxed iframe renderer for rich artifacts |
| **Untrusted Plugin Sandbox** | **MISSING** | Pre-execution AST scan only | Implement isolated process / worker sandbox |
