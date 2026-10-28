# DUO 0.3.5 release notes

DUO 0.3.5 is a stable patch for 0.3.4, for the npm dist-tag `latest`. It fixes [#104](https://github.com/kanghyunsoon/duo/issues/104): `duoctl install remove` could delete agent files that existed before DUO was installed. Reviews, context, Decisions, the MCP tools and the CLI commands behave as in 0.3.4.

0.3.x is the supported line for security and data-safety fixes ([SECURITY.md](../../SECURITY.md)). External Validation 01 keeps using exactly 0.2.1.

## The problem (#104)

From 0.3.0 through 0.3.4 (and 0.4.0-rc.1 on `next`), `duoctl install remove <agent>` decided whether to delete a file only by whether it was empty after DUO's entry or block was taken out. A project that already had an empty `.mcp.json` (`{"mcpServers": {}}`), a 0-byte `CLAUDE.md` or `AGENTS.md`, or an empty `.codex/config.toml` before `duoctl install` lost that file on remove. Files with other content were never deleted. If a lost file was committed, `git checkout -- <file>` brings it back.

## What changed

0.3.5 follows Human Decision H-94 ([details](../validation/issue-104-file-ownership.md)).

- `duoctl install <agent>` writes a local ownership record, `.duo-project/runtime/agent-integration/<agent>.json` (`duo.agent-file-ownership/1`). For each of that agent's two files it stores whether the file existed before install and sha256 digests before and after install. It holds no file contents, secrets or absolute paths. `.duo-project/runtime/` is ignored by Git, so the record is never committed.
- Remove deletes a whole file only when the record says DUO created it and the file is unchanged since install.
- A file that existed before install is never deleted. If it is unchanged since install and the pre-install backup matches the recorded digest, remove puts back its exact original bytes. If a person edited it after install, remove takes out only DUO's entry or block and keeps the edit.
- Without a valid record (an install by 0.3.4 or earlier, another clone, a deleted or corrupted record), remove deletes nothing. It takes out DUO's entry or block, keeps the file, and says why in the plan warnings, for example `keep .mcp.json (no install record)`. If DUO's part cannot be identified safely, remove changes nothing and reports `AGENT_INTEGRATION_CONFLICT`.

## Upgrading from 0.3.4 or earlier

Install `@duo-director/cli@0.3.5` globally or as the project's dev dependency. The generated agent configuration is unchanged, so there is no need to rerun `duoctl install`.

Integrations installed by 0.3.4 or earlier have no ownership record. 0.3.5 therefore removes them conservatively:

- No file is deleted, including files that DUO 0.3.4 created. They stay as empty files (`.mcp.json` as `{"mcpServers": {}}`); delete them yourself if you do not need them.
- A pre-existing `.mcp.json` keeps its value but may be rewritten with two-space formatting, because there is no record to prove the backup is the original.
- Running `duoctl install` again with 0.3.5 does not change this: a file that already exists cannot be told apart from a user file.

Installs made by 0.3.5 delete the files DUO created and restore pre-existing files byte for byte.

## Unchanged

Dependencies (the same 67 bundled packages as 0.3.4, no install scripts), Project Truth (`schema_version: 1`), the Decision Lock, every `/1` format including `duo.agent-integration-plan/1` (a kept file uses the existing `modify` action), the nine MCP tools with their names, schemas and annotations, the UI API, CLI commands, options and exit codes, and the Graph format. The launcher changes on `next` (#40) are not part of 0.3.5.

## Going back

0.3.4 reads the same Project Truth and ignores the ownership record, but it has #104.

## Known limitations

Same as [0.3.4](notes-0.3.4.md#known-limitations), plus the conservative removal of older installs described above. The ownership record is local operational information for safe cleanup, not an authentication mechanism.
