/**
 * Release authorization guard (H-81, T63). Run right before npm publish: release:authorization.
 *
 * T60 incident: a helper that inserted the H-74 row and the checklist section read the wrong argument and inserted
 * its own source. The package was not affected, but the release record did not name the release. This guard checks
 * that the human record names the exact candidate before anything is published:
 *
 *   - a Human Decision row (| H-n |) in docs/conflicts.md holds the full candidate commit SHA and the exact version
 *     (0.3.0 does not match 0.3.0-rc.6),
 *   - a section of docs/release/checklist.md whose heading holds the exact version names the commit (7+ characters),
 *   - neither file holds a line of program source (a line that starts like JavaScript, or require of fs),
 *   - between the candidate commit and HEAD only docs/ changed, and the candidate is an ancestor of HEAD.
 *
 * The record is read at a Git ref, never from the working tree: HEAD for a stable release (the record is on main, where
 * stable is cut) and origin/main for a prerelease (H-74 rows live on main while the candidate is on next). The ref
 * must be the pushed commit. Pure functions are exported for tests; the CLI writes .dist/release-authorization.json.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { channelPolicy } from "./channel.mjs";

/** A RegExp that finds the version as a whole token: "0.3.0" is found in "0.3.0." and "(0.3.0)", not in "0.3.0-rc.6". */
export function versionPattern(version) {
  const escaped = String(version).replace(/[.+]/gu, (c) => "\\" + c);
  return new RegExp("(?<![0-9A-Za-z.+-])" + escaped + "(?![0-9A-Za-z+-]|\\.[0-9A-Za-z])", "u");
}

const SOURCE_LINE = /^\s*(?:const|let|var|import|export|function|async\s+function)\s/u;
const SOURCE_CALL = /^\s*(?:require|process|module)\s*[.(]/u;
const FS_REQUIRE = /require\(\s*['"](?:node:)?fs['"]\s*\)/u;

/** Lines (1-based) that look like inserted program source. */
export function insertedSourceLines(text) {
  return String(text).split(/\r?\n/u).flatMap((line, i) => (SOURCE_LINE.test(line) || SOURCE_CALL.test(line) || FS_REQUIRE.test(line) ? [i + 1] : []));
}

/** Problems ({ id, message }) for the release record of { version, commit }. */
export function authorizationProblems({ version, commit, conflictsText, checklistText }) {
  const out = [];
  if (!/^[0-9a-f]{40}$/u.test(String(commit))) out.push({ id: "candidate-commit", message: "the candidate commit is not a full SHA: " + commit });
  const v = versionPattern(version);
  const rows = String(conflictsText).split(/\r?\n/u).filter((l) => /^\| H-\d+ \|/u.test(l));
  const decisions = rows.filter((l) => l.includes(commit) && v.test(l)).map((l) => l.split("|")[1].trim());
  if (decisions.length === 0) out.push({ id: "decision-record", message: "no Human Decision row in docs/conflicts.md names commit " + commit + " and version " + version });
  const sections = String(checklistText).split(/^(?=## )/mu).filter((s) => s.startsWith("## "));
  const short = String(commit).slice(0, 7);
  const section = sections.find((s) => v.test(s.split(/\r?\n/u)[0]) && s.includes(short));
  if (section === undefined) out.push({ id: "checklist-record", message: "no section of docs/release/checklist.md has " + version + " in its heading and names commit " + short });
  for (const [name, text] of [["docs/conflicts.md", conflictsText], ["docs/release/checklist.md", checklistText]]) {
    const lines = insertedSourceLines(text);
    if (lines.length > 0) out.push({ id: "inserted-source", message: name + " holds lines that look like program source: " + lines.slice(0, 10).join(", ") });
  }
  return { problems: out, decisions, checklistHeading: section === undefined ? null : section.split(/\r?\n/u)[0] };
}

/** Changed paths between the candidate and HEAD that are not documentation. */
export function nonDocumentationChanges(paths) {
  return paths.filter((p) => p.length > 0 && !p.startsWith("docs/"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).trim();
  const candidateFile = path.resolve(root, arg("--candidate") ?? ".dist/release-candidate.json");
  const candidate = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
  const version = candidate.version;
  const commit = candidate.git?.commit;
  const problems = [];
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, "apps", "cli", "package.json"), "utf8")).version;
  if (pkgVersion !== version) problems.push({ id: "version", message: "apps/cli/package.json is " + pkgVersion + ", the candidate is " + version });
  const policy = channelPolicy(version);
  if (policy === null) problems.push({ id: "version-invalid", message: "not a SemVer version: " + version });
  const ref = arg("--ref") ?? (policy?.releaseChannel === "stable" ? "HEAD" : "origin/main");
  const refCommit = git("rev-parse", ref);
  const pushedRef = policy?.releaseChannel === "stable" ? "origin/main" : "origin/main";
  if (git("rev-parse", pushedRef) !== refCommit) problems.push({ id: "record-not-pushed", message: "the record at " + ref + " (" + refCommit + ") is not the pushed " + pushedRef });
  let ancestor = true;
  try { execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { cwd: root }); } catch { ancestor = false; }
  if (!ancestor) problems.push({ id: "candidate-not-ancestor", message: "the candidate " + commit + " is not an ancestor of HEAD" });
  const changed = ancestor ? nonDocumentationChanges(git("diff", "--name-only", commit, "HEAD").split(/\r?\n/u)) : [];
  if (changed.length > 0) problems.push({ id: "changed-after-candidate", message: "files outside docs/ changed after the candidate: " + changed.slice(0, 10).join(", ") });
  const show = (file) => git("show", ref + ":" + file);
  const record = authorizationProblems({ version, commit, conflictsText: show("docs/conflicts.md"), checklistText: show("docs/release/checklist.md") });
  problems.push(...record.problems);
  const report = { format: "duo.release-authorization/1", version, channel: policy?.releaseChannel ?? null, commit, recordRef: ref, recordCommit: refCommit, decisions: record.decisions, checklistHeading: record.checklistHeading, problems, ok: problems.length === 0 };
  fs.mkdirSync(path.join(root, ".dist"), { recursive: true });
  fs.writeFileSync(path.join(root, ".dist", "release-authorization.json"), JSON.stringify(report, null, 2) + "\n");
  for (const p of problems) console.error("release:authorization: " + p.id + ": " + p.message);
  console.log("release:authorization: " + (report.ok ? "OK" : "BLOCKED") + " · " + version + " · " + commit + " · record " + ref + " " + refCommit.slice(0, 7) + (record.decisions.length > 0 ? " · " + record.decisions.join(", ") : ""));
  process.exit(report.ok ? 0 : 1);
}
