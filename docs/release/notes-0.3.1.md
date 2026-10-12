# DUO 0.3.1 release notes

DUO 0.3.1 is a stable correctness patch for 0.3.0, published to the npm dist-tag `latest` (`npm install -g @duo-director/cli`). It fixes five ways in which 0.3.0 could give a verdict, usually PASS, that the evidence did not support (C261 to C265, found in an adversarial dogfood of 0.3.0; H-82, H-83). It adds no feature. Repositories whose Project Truth is valid get the same results as with 0.3.0.

0.3.x is the supported line for security fixes ([SECURITY.md](../../SECURITY.md)). External Validation 01 keeps using exactly 0.2.1. Its participants are not moved to 0.3.1.

## What changes for users

### Decision authority integrity (C261, C262, C263)

- **A confirmed Decision whose content no longer matches its lock is not trusted, wherever the edit came from.** 0.3.0 checked the lock only when the Decision file was part of the reviewed diff. If someone weakened `enforcement` or changed `forbids` and committed it earlier, later reviews used the weakened Decision as authority. In 0.3.1, review, context, the Adoption Baseline and `duoctl decision` stop with `PROJECT_TRUTH_INVALID` and `DECISION_INTEGRITY_INVALID` (the file and the reason). `duoctl status` lists the error and `duoctl doctor` reports action required (exit code 6).
- **An impossible Decision lifecycle fails closed instead of quietly removing authority.** Examples: a locked Decision set back to `proposed` or `rejected`, a confirmed Decision that names `superseded_by`, or `superseded_by` pointing to a Decision that does not supersede it. Supersessions made with `duoctl decision` stay valid. Inside a reviewed diff, a confirmed Decision moved to `proposed` or `rejected` is a blocking claim (`confirmed-decision-retired`).
- **A Decision-like Markdown file that DUO cannot read as a Decision is reported, not ignored.** In `.duo-project/decisions/`, a frontmatter with `type: Decision` (any case other than `decision`) or with `id: D-###` but without `type: decision` is `DECISION_SOURCE_INVALID`. Other files, such as a README, notes or `D-001.yaml.txt`, are still not Project Truth.

To fix such a state, restore the file from Git, or change the Decision through `duoctl decision` (supersede it). DUO does not change the file.

### Review snapshot correctness (C264)

`duoctl review --staged` and `--to <commit>` take the diff from the reviewed side, but DUO's index and Project Truth describe the working tree. In 0.3.0 a staged forbidden import could PASS when its working-tree copy had already changed, and a Decision edited only in the working tree could decide a staged change.

In 0.3.1, if a changed path of the diff or a Project Truth file differs between the reviewed snapshot and the working tree, the review ends without a verdict: `REVIEW_SNAPSHOT_MISMATCH`, exit code 1, with the paths. Stage or stash the differing working-tree changes, or check out the reviewed commit, and review again. DUO does not stage, stash, check out or edit anything. When only files outside the diff differ, the review runs and lists the limitation `reviewed-side-context-from-working-tree`.

0.3.1 fails closed here; it does not analyze the staged snapshot or an old commit by itself. Reviews of the working tree (the default) and CI reviews of a checked-out commit range are unchanged.

### Review analysis completeness (C265)

When a review could not build the Context it needs, for example for a very large diff whose packet frame does not fit the budget, 0.3.0 skipped the Knowledge Gap assessment (the only source of ASK) and could PASS. 0.3.1 gives no verdict: `REVIEW_ANALYSIS_INCOMPLETE` with the original cause (such as `CONTEXT_REQUEST_INVALID`), exit code 1 with or without `--fail-on`, MCP `isError`, a failed review in the local UI, and no Review Record for `--record`. The failure is not turned into ASK. Retry with a larger `--budget` or review fewer files with `--files`.

A review whose only gap is missing intent is still PASS with the gap shown (H-80).

## Upgrade

- From 0.3.0, 0.2.2 or 0.2.1: no migration and no re-init. Nothing is rewritten: Decisions, locks, proposals, Adoption Baselines, Review Records and agent configuration are read as they are. An index built by 0.3.0 stays current.
- A repository whose Project Truth already holds one of the invalid states above now stops with `PROJECT_TRUTH_INVALID` until it is fixed. This is intended.
- Some reviews that ended with a verdict in 0.3.0 now end without one (exit code 1): Decision authority that is not intact, a reviewed snapshot that differs from the working tree, and an incomplete required analysis.

## Going back

0.3.0 reads the same Project Truth, but it brings back the five defects. The downgrade floor for repositories that use 0.3 Truth is still 0.2.2.

## Known limitations

- **`outside-current-milestone` WARN noise** (C259): in a repository that tracks Requirements by milestone, a normal change to files that implement a Requirement of another milestone gets a PARTIAL claim and a WARN. Check this before you use `--strict` (`--fail-on warn`) in CI for such a repository. The claim never blocks.
- **Reviewed snapshots** (C264): `--staged` and `--to <commit>` are reviewed only when the working tree matches them where the review reads; DUO does not analyze another snapshot on its own.
- **What the lock cannot show**: deleting a confirmed Decision file is caught only when the deletion is inside the reviewed diff; a lock digest recomputed by hand is not detected (the lock detects mistakes and is not a signature); a confirmed Decision without a lock is treated as the manual fallback.
- Root files without a separator or a dot (`LICENSE`, `Dockerfile`, `Makefile`) need `./` in a task to be read as the file.
- Secret files (`.env*` and the other secret-file patterns) are not indexed and never appear in context.
- `imported_paths`: an import through a barrel or re-export file is not seen as an import of the file behind it (false negatives). Java and C# imports are not checked.
- Agents read the structured provenance value `introduced` and may describe it as "introduced by this change". People see `not-in-adoption-baseline`.
- Language coverage: TypeScript and JavaScript are L2; Java, C#, C++ and Python are L1 (C++ IMPORTS do not follow include paths); other files are L0.
- Node.js `>=24.15.0`.
- Package size: about 24 MB packed and 114 MB unpacked, because the 67 runtime dependencies are bundled.

## Machine contract changes since 0.3.0

- Diagnostics (additive): `DECISION_INTEGRITY_INVALID`, `DECISION_SOURCE_INVALID`, `REVIEW_SNAPSHOT_MISMATCH`, `REVIEW_ANALYSIS_INCOMPLETE`. Review claim reason `confirmed-decision-retired` and limitation `reviewed-side-context-from-working-tree`.
- Behavior corrections: the conditions above end without a result (CLI exit code 1, MCP `isError`, no Review Record) where 0.3.0 gave a verdict.
- Human-readable wording of `duoctl status`, `duoctl decision list`, `duoctl doctor` and `PROJECT_TRUTH_INVALID` now covers Truth that is inconsistent as well as unreadable.
- Unchanged: Truth schema (`schema_version: 1`), the Decision Lock format and its digest fields, `duo.review/1`, `duo.context/1`, `duo.context-packet/1`, `duo.gap-assessment/1`, `duo.review-record/1`, `duo.adoption-baseline/2`, `CONTEXT_POLICY_VERSION` 8, MCP tools (nine), the CLI exit code table.

The package file, its size and hashes are listed in the GitHub Release `v0.3.1`.
