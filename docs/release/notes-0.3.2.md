# DUO 0.3.2 release notes

DUO 0.3.2 is a small stable patch for 0.3.1, published to the npm dist-tag `latest` (`npm install -g @duo-director/cli`). It fixes one bug in removing an agent integration ([#6](https://github.com/kanghyunsoon/duo/issues/6)) and improves the instructions DUO writes for coding agents ([#8](https://github.com/kanghyunsoon/duo/issues/8)) (H-84, H-85, H-86). It adds no feature. Reviews, context and Decisions behave as in 0.3.1.

0.3.x is the supported line for security fixes ([SECURITY.md](../../SECURITY.md)). External Validation 01 keeps using exactly 0.2.1. Its participants are not moved to 0.3.2.

## Fixed: `duoctl install remove` left the MCP server configured (#6)

When DUO had created the agent's configuration file (`.codex/config.toml` for Codex, `.mcp.json` for Claude Code), `duoctl install remove <agent>` planned to delete it, then rewrote it unchanged, reported `modify`, and left the `duo-director` server configured. The DUO block in AGENTS.md or CLAUDE.md was removed, so the agent kept starting DUO's server without instructions. `duoctl install status` then reported `drifted`.

In 0.3.2 the file DUO created is deleted (an empty `.codex/` with it), the result line reports `delete`, and `duoctl install status` reports `not-configured`. A second remove changes nothing. As before, the original is first copied to `.duo-project/runtime/backup/` in an initialized repository.

Configuration files that existed before `duoctl install` keep everything that is not DUO's: other MCP servers, other keys and the text outside the DUO block. Codex TOML, AGENTS.md and CLAUDE.md come back byte for byte. `.mcp.json` keeps every value, but DUO writes JSON with the file's indentation, so hand-formatted JSON (for example an object written on one line) can be reformatted. This is how install and remove already worked.

If 0.3.1 already left an entry behind, run `duoctl install remove <agent>` again with 0.3.2.

## Improved: what the agent is told when it cannot see DUO's tools (#8)

Some MCP clients show tools nested or deferred instead of under their own names, and agents then said DUO's tools were missing. The DUO block in AGENTS.md and CLAUDE.md gains two lines:

- If the `duo_*` tools are not listed by name, look for the tools of the `duo-director` MCP server. If they are unavailable, run `duoctl status`, `duoctl context "<task>"` and `duoctl review` in a shell instead.
- If `duo_propose_decision` is unavailable, do not edit `.duo-project/`. Tell the human that DUO's decision proposal tool is unavailable in this client or session, and ask them to request the proposal where DUO's MCP tools are available.

This changes instructions only. It does not make a client show the tools, and how often agents find them has not been measured again yet (#8 stays open). With `--launcher npx` the commands read `npx --no-install duoctl …`. The block is 8 lines between its markers.

**Existing installs keep the old block until you run `duoctl install codex` or `duoctl install claude-code` again.** `duoctl install status` and `duoctl doctor` report the old block as outdated. Reinstalling replaces only the DUO block and leaves the rest of the file as it is.

## Unchanged

- Decisions and human authority: agents can only propose; people confirm, reject and supersede.
- Truth schema (`schema_version: 1`), the Decision Lock format and its digest fields.
- Review verdict policy, including H-80 and the C261 to C265 corrections of 0.3.1.
- MCP tools (nine) and their schemas; the CLI exit code table.
- Public formats `duo.review/1`, `duo.context/1`, `duo.context-packet/1`, `duo.gap-assessment/1`, `duo.review-record/1`, `duo.adoption-baseline/2`; `CONTEXT_POLICY_VERSION` 8.

## Upgrade

From 0.3.1, 0.3.0 or 0.2.2: no migration and no re-init. Project Truth, locks, proposals, Adoption Baselines, Review Records and indexes are read as they are. Only the agent bridge block is reported as outdated until you reinstall the integration.

## Going back

0.3.1 reads the same Project Truth and brings back the `install remove` bug and the shorter agent block. The downgrade floor for repositories that use 0.3 Truth is still 0.2.2.

## Known limitations

0.3.2 does not make DUO hands-free. Work on that is tracked in [#2](https://github.com/kanghyunsoon/duo/issues/2) for 0.4.

- **README edits make reviews WARN** ([#7](https://github.com/kanghyunsoon/duo/issues/7)): if you accepted `duoctl init`'s suggestion to take the project goal from the README, any later README edit makes reviews WARN with `external-source-drift`. This follows the current provenance contract (the whole file is the source) and is planned for 0.4. 0.3.2 adds no official way to accept the new README.
- **Other WARN noise** ([#5](https://github.com/kanghyunsoon/duo/issues/5)): changes to files of a Requirement in another milestone (C259), and files the task names that are reported outside the task (C260). Check these before you use `--strict` in CI.
- **Stale index** ([#4](https://github.com/kanghyunsoon/duo/issues/4)): after code changes, context and review ask for `duoctl index` (or `--refresh`); the MCP server does not refresh the index itself.
- **First-time setup takes several commands** ([#3](https://github.com/kanghyunsoon/duo/issues/3)): `duoctl init`, `duoctl install <agent>`, `duoctl doctor`, then trusting the project in Codex or approving the server in Claude Code.
- **MCP tool discovery depends on the client** (#8).
- The limitations listed for 0.3.1 still apply (reviewed snapshots fail closed rather than being analyzed, what a lock cannot show, root files without a separator need `./`, secret files are not indexed, `imported_paths` does not follow re-exports, language coverage: TypeScript and JavaScript L2; Java, C#, C++ and Python L1; other files L0).
- Node.js `>=24.15.0`. About 24 MB packed and 114 MB unpacked (67 bundled runtime dependencies).

## Machine contract changes since 0.3.1

- `duoctl install remove`: the applied action for a configuration file that held only DUO's entry is `delete` (was `modify` with the file left unchanged). The plan format is unchanged.
- The generated bridge block text (AGENTS.md, CLAUDE.md) has two more lines; installed blocks are reported `outdated`.
- No other change.

The package file, its size and hashes are listed in the GitHub Release `v0.3.2`.
