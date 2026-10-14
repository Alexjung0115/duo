# DUO 0.3.3 release notes

DUO 0.3.3 is a stable patch for 0.3.2, published to the npm dist-tag `latest` (`npm install -g @duo-director/cli`). It makes five things clearer or faster for people who set up DUO and for the coding agents that use it (H-87). It adds no rule and no new kind of check: reviews, context and Decisions give the same results as in 0.3.2.

0.3.x is the supported line for security fixes ([SECURITY.md](../../SECURITY.md)). External Validation 01 keeps using exactly 0.2.1. Its participants are not moved to 0.3.3.

## Constraints that DUO does not check are now named (#14)

`duoctl init` asks for critical constraints and records them in `intent/constraints.yaml`. These constraints have no `match` scope, so context and review never use them. In 0.3.2 a review then returned PASS without a word about them, and that PASS was easy to read as "my constraint holds".

0.3.3 says so wherever you look:

- `duoctl init`: the question says the constraints are "recorded as notes, not checked", and after recording them init explains that a rule DUO should check is a Decision with `forbids` that an agent proposes and a person confirms.
- `duoctl status` and the MCP `duo_get_status` text: `Constraints not checked: CON-001, CON-002 …`.
- `duoctl doctor`: a note under the Project Truth check. The check stays `ok`.
- `duoctl review`: the limitation `constraints-unscoped` and a line with the IDs.

**This does not add constraint checking.** DUO still never checks a constraint deterministically. A constraint with a `match` scope is used as before: it enters the context when related and gets an UNKNOWN `constraint-compliance` claim that needs a semantic check. Rules DUO checks deterministically are confirmed Decisions with `forbids`. Verdicts, claims and exit codes are the same as in 0.3.2.

## Faster MCP startup, and the agent is asked to look again (#8)

Some clients, Codex among them, can build the agent's tool list before the MCP server has answered `initialize`, and an agent then starts without DUO's tools. In a T75 experiment with a test server that delayed `initialize` on purpose (Codex 0.147.0), the agent used the tools in 6 of 6 sessions with no delay and in 0 of 4 sessions with 1.8 seconds.

- `duoctl mcp` now loads the TypeScript compiler, the tokenizer, the MCP client, the YAML library and the Markdown parser when they are first needed, not at startup. The tool list, the tool schemas and the results are unchanged; the first tool call pays for the libraries it uses.
- The DUO block in AGENTS.md and CLAUDE.md gains one line (9 lines between the markers): if the `duo_*` tools are not in the tool list when the session starts, wait a few seconds and check again before falling back to the CLI.

Measured on Windows with Node.js 24.18, the packed `duoctl`, a 19-file test repository, and the time from starting the process to the `initialize` answer (medians):

| Run | 0.3.2 alone | 0.3.3 alone | 0.3.2, 8 starting together | 0.3.3, 8 starting together |
|---|---|---|---|---|
| T76 (lightly loaded machine) | 1.19 s | 0.49 s | 2.17 s | 0.78 s |
| T77 (same machine, heavier load) | 1.61–1.73 s | 0.72–0.83 s | 1.93–2.00 s | 0.99–1.03 s |

The times depend on the machine, its load, the disk and the repository. They are not a guarantee, and 0.3.3 is not fast enough everywhere to win the race against every client. **Whether Codex now finds DUO's tools more often has not been measured with a real Codex session (NOT TESTED).** #8 stays open until that is measured.

**Existing installs keep the old block until you run `duoctl install codex` or `duoctl install claude-code` again.** `duoctl install status` and `duoctl doctor` report the old block as outdated. Reinstalling asks first (or needs `--yes`) and replaces only the DUO block.

Because libraries now load late, `duoctl` checks at startup that every declared runtime dependency can be found, so a damaged installation is still reported as incomplete before anything runs.

## Clear errors for `duoctl init --answers -` (#15)

Answers given as JSON on stdin are checked before anything is read or written. A wrong shape, for example `{"question":"critical_constraints","value":"No legacy DB"}`, now fails with `INIT_ANSWER_INVALID` and names the question, the field and an example:

```text
critical_constraints needs "statements": an array of strings, for example {"question":"critical_constraints","statements":["No cloud sync"]}
```

0.3.2 failed with `CLI_USAGE_INVALID: a.statements is not iterable`. Both write nothing and exit with 1. The README ("Everyday commands") and the CLI reference show the three answer shapes. Valid answers behave as before, and unknown extra keys are still ignored.

## The human review output shows what was found (#16)

Under each CONFLICT claim, `duoctl review` now prints the claim's `observed` text. For a forbidden import that is the exact file and line:

```text
  CONFLICT  decision-forbids-import    D-001 · forbidden-import [blocking, not-in-adoption-baseline]
            observed: forbidden import on a changed line: src/ui/customer-history-page.js:3 import "../db/legacy-db.js" resolves to src/db/legacy-db.js
            evidence: src/ui/customer-history-page.js:1-5, .duo-project/decisions/D-001.yaml:1-25, src/db/legacy-db.js
```

The evidence ranges are still the diff hunks (for a new file, the whole file). `--json`, the MCP results and Review Records are unchanged.

## How to finish the setup in Codex and Claude Code (#3, part a)

`duoctl install` and the README now say how to do the one step that happens in the agent, based on the agents' documentation (checked in October 2026). DUO still never does it for you.

- Codex reads `.codex/config.toml` only in a trusted project: trust the folder when Codex asks on first launch, or add it under `[projects]` with `trust_level = "trusted"` in `~/.codex/config.toml`. `/mcp` in Codex then lists `duo-director`.
- Claude Code asks before it uses a server from `.mcp.json`: run `claude` in the project, accept the workspace trust dialog and approve `duo-director`. Until then `claude mcp get duo-director` shows `Pending approval`.

The one-command setup of #3 is still planned for 0.4.

## Unchanged

- What PASS means: DUO found no direction violation in the evidence it has. It does not mean that the change follows every project rule, and constraints are not checked.
- Decisions and human authority: agents can only propose; people confirm, reject and supersede.
- Truth schema (`schema_version: 1`), the Decision Lock format and its digest fields, the Adoption Baseline.
- Review verdict policy, including H-80 and the C261 to C265 corrections of 0.3.1; the CLI exit code table.
- MCP tools (nine), their names, schemas and annotations.
- Public formats `duo.review/1`, `duo.context/1`, `duo.context-packet/1`, `duo.gap-assessment/1`, `duo.review-record/1`, `duo.adoption-baseline/2`; `CONTEXT_POLICY_VERSION` 8. Token counts use the same encoding.
- Runtime dependencies (67 bundled packages) and their versions.

## Upgrade

From 0.3.2, 0.3.1, 0.3.0 or 0.2.2: no migration and no re-init. Project Truth, locks, proposals, Adoption Baselines, Review Records and indexes are read as they are. Only the agent bridge block is reported as outdated until you reinstall the integration.

## Going back

0.3.2 reads the same Project Truth. It brings back the silent PASS for unscoped constraints, the slower MCP startup, the internal error for wrong init answers and the shorter agent block. The downgrade floor for repositories that use 0.3 Truth is still 0.2.2.

## Known limitations

0.3.3 does not make DUO hands-free. Work on that is tracked in [#2](https://github.com/kanghyunsoon/duo/issues/2) for 0.4.

- **Constraints are not checked** ([#14](https://github.com/kanghyunsoon/duo/issues/14)): 0.3.3 only names them. Scoping constraints at init and checking them are planned for 0.4.
- **MCP tool discovery depends on the client** ([#8](https://github.com/kanghyunsoon/duo/issues/8)): faster startup narrows the window, but a client can still start without DUO's tools. Real Codex sessions have not been measured yet.
- **README edits make reviews WARN** ([#7](https://github.com/kanghyunsoon/duo/issues/7)) if you accepted the README as the source of the project goal; planned for 0.4.
- **Other WARN noise** ([#5](https://github.com/kanghyunsoon/duo/issues/5)): C259 and C260. Check these before you use `--strict` in CI.
- **Stale index** ([#4](https://github.com/kanghyunsoon/duo/issues/4)): after code changes, context and review ask for `duoctl index` (or `--refresh`).
- **First-time setup takes several commands** ([#3](https://github.com/kanghyunsoon/duo/issues/3)), and trusting or approving in the agent stays a manual step.
- `.mcp.json` keeps every value on install and remove, but hand-formatted JSON can be reformatted.
- The limitations listed for 0.3.1 and 0.3.2 still apply (reviewed snapshots fail closed rather than being analyzed, what a lock cannot show, root files without a separator need `./`, secret files are not indexed, `imported_paths` does not follow re-exports, language coverage: TypeScript and JavaScript L2; Java, C#, C++ and Python L1; other files L0).
- Node.js `>=24.15.0`. About 24 MB packed and 114 MB unpacked (67 bundled runtime dependencies).

## Machine contract changes since 0.3.2

- `duo.status/1` (CLI `status --json`, MCP `duo_get_status`): new field `truth.unscopedConstraints` (IDs; empty when none). The `duo_get_status` text gains a `constraints not checked` part when the list is not empty.
- `duo.doctor/1`: the `truth.project` check gains the fact `unscopedConstraints`.
- `duo.review/1`: new limitation code `constraints-unscoped`. It is not a verdict input.
- `duoctl init --answers -`: a wrong answer shape is `INIT_ANSWER_INVALID` (was `CLI_USAGE_INVALID` with an internal message); same exit code 1, nothing written. The constraint question text changed.
- Human `duoctl review` output: one `observed:` line under each CONFLICT claim.
- `duoctl install`: the plan `warnings` and the `nextActions` for Codex trust and Claude Code approval say how to do the step (text only).
- The generated bridge block (AGENTS.md, CLAUDE.md) has one more line; installed blocks are reported `outdated`.
- `duoctl` checks that its declared runtime dependencies resolve before it runs any command.

The package file, its size and hashes are listed in the GitHub Release `v0.3.3`.
