# DUO 0.3.0 release notes

DUO 0.3.0 is the stable release of the 0.3 line, published to the npm dist-tag `latest` (`npm install -g @duo-director/cli`). It promotes the validated 0.3.0-rc.6 unchanged: the product source is the rc.6 source (`d0f29a5`), and only the version and release documents differ (H-81). This page compares 0.3.0 with the previous stable release, 0.2.2; the per-candidate notes are [rc.3](notes-0.3.0-rc.3.md), [rc.4](notes-0.3.0-rc.4.md), [rc.5](notes-0.3.0-rc.5.md) and [rc.6](notes-0.3.0-rc.6.md).

External Validation 01 keeps using exactly 0.2.1. Its participants are not moved to 0.3.0.

## What changes for users

### Human-confirmed Decisions, end to end

- **Agents can propose complete enforceable Decisions** (H-71). The MCP tool `duo_propose_decision` accepts `forbids`, `enforcement` and `supersedes`. A proposal has no authority until a person confirms it. No MCP tool can confirm, reject or write a Decision, and there are still nine MCP tools.
- **People confirm exactly what they reviewed.** `duoctl decision confirm` and the Web UI show the whole candidate first: title, question, answer, rationale, governs, forbids and their repository-wide scope, enforcement, the Decision it supersedes, staleness, the proposer and the expected ID. The confirm is bound to that preview. If the candidate changed, nothing is confirmed (`DECISION_CONFIRM_PREVIEW_CHANGED`).
- **`duoctl decision review-pending`** reviews every pending proposal in one terminal session. You choose IDs, `all` or `one` at a time and type the chosen IDs again. Proposals you do not choose stay pending. Only a person at a terminal can do this (`CLI_TTY_REQUIRED` otherwise). A session whose proposals depend on each other is refused (`DECISION_SESSION_CONFLICT`).
- **Review shows which Decision the verdict used.** A claim about a Decision says `current authority`, `supersedes D-001` or `superseded · superseded by D-002` (CLI, MCP text, Web UI). It explains the verdict and does not change it.

### Enforcing direction in code

- **`forbids.imported_paths`** (H-72): a confirmed Decision can forbid repository imports. A changed import line whose module reference resolves to exactly one matching repository file is a `decision-forbids-import` CONFLICT, and with `enforcement: block` it can block. It checks changed lines. It does not claim the change created the import. Unresolved and ambiguous imports never block and are listed as limitations.

### Context that keeps what you named

- **A task that names an Issue or Requirement by ID keeps its full text and all its Acceptance Criteria** in the context before lower-ranked evidence (H-76). If it cannot fit, the packet says so (`explicit-seed-truncated`).
- **Issues can declare the paths they implement** (`implements.paths`, H-78). A task that names only the Issue ID then reaches those files and the Decisions that govern them.
- **Exact paths and symbols are read exactly.** `src/auth/session.ts`, `./src/auth/session.ts`, `src\auth\session.ts`, `.github/workflows/ci.yml`, root files with a dot such as `package.json` or `.gitignore` (H-79), and exact symbols such as `Session.open` become exact seeds. A word used as an exact seed is not searched again as a keyword, so similarly named files and the Decisions governing them no longer leak in. The other words of the task are still searched.

### Review signal quality

- **A missing-intent gap alone no longer makes a review WARN** (H-80). The gap means the context DUO assembled holds no confirmed Requirement or Decision. It is still reported in the CLI, `--json`, the MCP payload and text, the Web UI and Review Records. With no other WARN, ASK or BLOCK basis the verdict is PASS, shown next to the gap. Other surfaced gaps still warn, and ASK and BLOCK are unchanged.
- The missing-intent sentence is precise: "The context DUO assembled contains no confirmed Requirement or Decision intent." (C258).
- The MCP review text lists Knowledge Gaps, including the question for the human on ASK.
- Provenance is shown in words a person reads correctly (H-73): `not-in-adoption-baseline`, `in-adoption-baseline`, `in-adoption-baseline, touched`, `baseline-unverified`. JSON keeps `introduced`, `pre-existing`, `pre-existing-touched`, `unverified-at-adoption`.

PASS keeps its meaning: no project-direction violation was found in the available evidence. It does not mean the change is bug-free or fully covered by Project Truth.

### Safety

- Invalid or partial Project Truth fails closed: review and context refuse with `PROJECT_TRUTH_INVALID` instead of leaving an unreadable Decision out. This is the same fix as 0.2.2.
- The bundled MCP SDK is 2.2.0 (GHSA-6qxp-vccf-f47h), as in 0.2.2. 67 bundled runtime packages, no install scripts.

## Upgrade

- A project made by 0.2.1 or 0.2.2 opens in 0.3.0 without migration. Nothing is rewritten: Decisions, locks, proposals, Adoption Baselines, Review Records and agent configuration are read as they are.
- The index is reported stale once after the upgrade (new context policy and relation rules). Run `duoctl index` once.
- A review whose only WARN basis was a missing-intent gap is PASS in 0.3.0, so `--fail-on warn` and `--strict` now exit 0 for it. Recording such a review gives a new Review Record ID. Earlier records are never rewritten.

## Going back to 0.2.x

0.2.2 is the fail-closed safety floor. It does not understand `forbids.imported_paths` or Issue `implements.paths`, and it refuses to review or build context for a repository that uses them (`PROJECT_TRUTH_INVALID`) instead of ignoring them. Opening such a repository with 0.2.1 or older is not supported, because those versions can leave the Decision or Issue out silently. To go back completely, first remove `implements.paths` and supersede Decisions that use `imported_paths`.

## Known limitations

- **`outside-current-milestone` WARN noise** (C259): in a repository that tracks Requirements by milestone, a normal change to files that implement a Requirement of another milestone gets a PARTIAL claim and a WARN. In one real repository, 6 of 15 normal commits were WARN for this reason. Check this before you use `--strict` (`--fail-on warn`) in CI for such a repository. The claim is factual and never blocks, and the behavior is the same as in 0.2.x.
- Root files without a separator or a dot (`LICENSE`, `Dockerfile`, `Makefile`) need `./` in a task to be read as the file.
- Secret files (`.env*` and the other secret-file patterns) are not indexed and never appear in context.
- `imported_paths`: an import through a barrel or re-export file is not seen as an import of the file behind it (false negatives). Java and C# imports are not checked.
- Agents read the structured provenance value `introduced` and may describe it as "introduced by this change". People see `not-in-adoption-baseline`.
- Language coverage: TypeScript and JavaScript are L2; Java, C#, C++ and Python are L1 (C++ IMPORTS do not follow include paths); other files are L0.
- Node.js `>=24.15.0`.
- Package size: about 24 MB packed and 114 MB unpacked, because the 67 runtime dependencies are bundled.

## Machine contract changes since 0.2.2

- Truth schema (additive, `schema_version: 1`): Decision and proposal `forbids.imported_paths`; Issue `implements.paths`. Decisions without the new field keep their lock digest.
- MCP: `duo_propose_decision` accepts optional `forbids`, `enforcement`, `supersedes` (0.2.x calls are accepted unchanged). Nine tools. The `duo_review_changes` text summary adds Knowledge Gaps.
- Review (`duo.review/1`, additive): rule value `decision-forbids-import`; optional `decisionAuthority` on Decision claims; `verdictBasis.warn` no longer lists missing-intent gaps.
- Adoption Baseline (`duo.adoption-baseline/2`): optional `evaluatedRules` on new captures.
- CLI: `duoctl decision review-pending`. Diagnostics `DECISION_CONFIRM_PREVIEW_CHANGED`, `DECISION_SESSION_CONFLICT`, `PROJECT_TRUTH_INVALID`. Context limitation `explicit-seed-truncated`.
- `CONTEXT_POLICY_VERSION` 2 → 8 and Graph relation rules 1 → 2: caches and the index are rebuilt once.
- Local Web UI API: confirming a proposal requires the preview digest (the bundled UI sends it).
- Unchanged: `duo.review-record/1`, `duo.gap-assessment/1`, `duo.context-packet/1`, project.yaml `schema_version: 1`, CLI exit codes.

The package file, its size and hashes are listed in the GitHub Release `v0.3.0`.
