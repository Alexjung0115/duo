/**
 * H-82 Group B (T67), end to end with the built duoctl, its MCP server and the UI route.
 * C264: a verdict exists only when its inputs describe the reviewed snapshot (--staged, --to <commit>).
 * C265: a required analysis stage that does not complete gives no verdict (not a PASS, not an ASK).
 */
import fs from "node:fs";
import path from "node:path";
import { createDecisionService } from "@duo-director/core";
import { projectReview } from "@duo-director/integration";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startMcp, type McpSession } from "../mcp/support.js";
import { duoctl, existingProject, type Project } from "./support.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });
const temps: string[] = [];
const sessions: McpSession[] = [];
afterAll(async () => {
  for (const s of sessions) await s.close().catch(() => undefined);
  temps.forEach((t) => fs.rmSync(t, { recursive: true, force: true }));
});

const D001 = "id: D-001\ntitle: No legacy-db imports\nkind: decision\nstate: proposed\nquestion: legacy_db\nanswer: Code does not import src/db/legacy-db.ts\nforbids:\n  imported_paths: [\"src/db/legacy-db.ts\"]\nenforcement: block\n";
const BAD = "import { LegacyDb } from \"../db/legacy-db.js\";\n\nexport const page = () => new LegacyDb();\n";
const GOOD = "import { DbClient } from \"../db/client.js\";\n\nexport const page = () => new DbClient();\n";
const VERDICT = /\b(PASS|WARN|BLOCK|ASK)\b/u;
const firstMessage = (j: { diagnostics: unknown }) => (j.diagnostics as { code: string; message: string }[])[0]?.message ?? "";
const records = (root: string) => fs.existsSync(path.join(root, ".duo-project/reviews")) ? fs.readdirSync(path.join(root, ".duo-project/reviews")).sort() : [];

describe("H-82 Group B: reviewed snapshot (C264) and required analysis (C265)", () => {
  let p: Project;
  let mcp: McpSession;
  beforeAll(async () => {
    p = existingProject(temps);
    p.write("src/db/legacy-db.ts", "export class LegacyDb {\n  run(sql: string): string[] {\n    return [sql];\n  }\n}\n");
    p.write("src/db/client.ts", "export class DbClient {\n  run(sql: string): string[] {\n    return [sql];\n  }\n}\n");
    p.git("add", "-A");
    p.git("commit", "-qm", "db");
    expect(duoctl(p.root, ["init", "--non-interactive", "--answers", "-", "--json"], "[]").code).toBe(0);
    p.git("add", "-A");
    p.git("commit", "-qm", "adopt DUO");
    p.write(".duo-project/decisions/D-001.yaml", D001);
    expect((await createDecisionService({ root: p.root }).confirm({ kind: "human", name: "Ada Lovelace" }, "D-001")).value?.decisionId).toBe("D-001");
    p.git("add", "-A");
    p.git("commit", "-qm", "confirm D-001");
    expect(duoctl(p.root, ["index"]).code).toBe(0);
    mcp = await startMcp(p.root);
    sessions.push(mcp);
  });

  it("B1/B2 --staged: the staged forbidden import blocks; when the working tree copy differs there is no verdict, on every surface", async () => {
    p.write("src/ui/page.ts", BAD);
    p.git("add", "src/ui/page.ts");
    expect(duoctl(p.root, ["review", "--staged", "--refresh", "--json"]).json().result.verdict).toBe("BLOCK"); // B2
    p.write("src/ui/page.ts", GOOD); // only the working tree copy is fixed
    expect(duoctl(p.root, ["index"]).code).toBe(0);
    const before = records(p.root);
    const json = duoctl(p.root, ["review", "--staged", "--json"]).json();
    expect(json).toMatchObject({ ok: false, exitCode: 1 });
    expect(json.result ?? null).toBeNull();
    expect(json.diagnostics.map((d: { code: string }) => d.code)).toEqual(["REVIEW_SNAPSHOT_MISMATCH"]);
    expect(firstMessage(json)).toContain("src/ui/page.ts");
    expect(firstMessage(json)).toContain("git stash --keep-index");
    const human = duoctl(p.root, ["review", "--staged"]);
    expect(human.code).toBe(1);
    expect(human.stdout + human.stderr).toContain("REVIEW_SNAPSHOT_MISMATCH");
    expect(human.stdout).not.toMatch(VERDICT);
    for (const gate of ["block", "ask", "warn"]) expect(duoctl(p.root, ["review", "--staged", "--fail-on", gate]).code, gate).toBe(1);
    expect(duoctl(p.root, ["review", "--staged", "--record"]).code).toBe(1);
    expect(records(p.root)).toEqual(before); // B7: no Review Record
    const m = await mcp.call("duo_review_changes", { from: "HEAD", to: "INDEX" });
    expect(m.isError).toBe(true);
    expect(m.structuredContent).toBeUndefined();
    expect(m.content[0]?.text).toContain("REVIEW_SNAPSHOT_MISMATCH");
    expect((await projectReview(p.root, { diff: { from: "HEAD", to: "INDEX" } })).kind).toBe("failed");
    expect(p.read("src/ui/page.ts")).toBe(GOOD); // DUO did not stage, stash or rewrite anything
    expect(p.git("diff", "--cached", "--name-only").trim()).toBe("src/ui/page.ts");
    p.git("reset", "-q");
    fs.rmSync(path.join(p.root, "src/ui"), { recursive: true });
  });

  it("B4 --staged: Project Truth that differs only in the working tree gives no verdict", () => {
    p.write("src/ui/page.ts", BAD);
    p.git("add", "src/ui/page.ts");
    // A valid working-tree-only Decision (no lock: the manual fallback), so this is the snapshot contract, not Group A.
    p.write(".duo-project/decisions/D-002.yaml", "id: D-002\ntitle: Allow legacy-db in UI\nkind: decision\nstate: confirmed\nquestion: ui_legacy\nanswer: UI may use LegacyDb\n");
    expect(duoctl(p.root, ["index"]).code).toBe(0);
    const json = duoctl(p.root, ["review", "--staged", "--json"]).json();
    expect(json).toMatchObject({ ok: false, exitCode: 1 });
    expect(json.diagnostics[0]).toMatchObject({ code: "REVIEW_SNAPSHOT_MISMATCH" });
    expect(firstMessage(json)).toContain(".duo-project/decisions/D-002.yaml");
    fs.rmSync(path.join(p.root, ".duo-project/decisions/D-002.yaml"));
    expect(duoctl(p.root, ["review", "--staged", "--refresh", "--json"]).json().result.verdict).toBe("BLOCK");
    p.git("reset", "-q");
    fs.rmSync(path.join(p.root, "src/ui"), { recursive: true });
  });

  it("B3/B8 --from/--to: the committed range is reviewed when the working tree matches it; a changed path that differs gives no verdict; other differences are a limitation", () => {
    p.write("src/ui/page.ts", BAD);
    p.git("add", "src/ui/page.ts");
    p.git("commit", "-qm", "ui page");
    const range = ["review", "--from", "HEAD~1", "--to", "HEAD", "--refresh", "--json"];
    const clean = duoctl(p.root, range).json().result;
    expect(clean.verdict).toBe("BLOCK");
    expect(clean.limitations.map((l: { code: string }) => l.code)).not.toContain("reviewed-side-context-from-working-tree");
    p.write("src/ui/page.ts", GOOD);
    const json = duoctl(p.root, range).json();
    expect(json).toMatchObject({ ok: false, exitCode: 1 });
    expect(json.diagnostics[0]).toMatchObject({ code: "REVIEW_SNAPSHOT_MISMATCH" });
    expect(firstMessage(json)).toContain("Check out the reviewed commit");
    p.git("checkout", "-q", "--", "src/ui/page.ts");
    p.write("src/db/client.ts", p.read("src/db/client.ts") + "// a later local edit\n"); // outside the reviewed diff
    const outside = duoctl(p.root, range).json().result;
    expect(outside.verdict).toBe("BLOCK");
    expect(outside.limitations.map((l: { code: string }) => l.code)).toContain("reviewed-side-context-from-working-tree");
    p.git("checkout", "-q", "--", "src/db/client.ts");
    p.git("reset", "-q", "--hard", "HEAD~1");
  });

  it("B5/B6/B7 C265: a review whose Context cannot be compiled gives no verdict (not a PASS, not an ASK) on every surface and writes no record", async () => {
    for (let i = 0; i < 300; i += 1) p.write(`src/gen/g${i}.ts`, `export const g${i} = ${i};\n`);
    expect(duoctl(p.root, ["index"]).code).toBe(0);
    const before = records(p.root);
    const json = duoctl(p.root, ["review", "--budget", "1000", "--json"]).json();
    expect(json).toMatchObject({ ok: false, exitCode: 1 });
    expect(json.result ?? null).toBeNull();
    expect(json.diagnostics.map((d: { code: string }) => d.code)).toEqual(["REVIEW_ANALYSIS_INCOMPLETE", "CONTEXT_REQUEST_INVALID"]);
    expect(firstMessage(json)).toContain("this is not an ASK");
    const human = duoctl(p.root, ["review", "--budget", "1000"]);
    expect(human.code).toBe(1);
    expect(human.stdout + human.stderr).toContain("REVIEW_ANALYSIS_INCOMPLETE");
    expect(human.stdout).not.toMatch(VERDICT);
    for (const gate of ["block", "ask", "warn"]) expect(duoctl(p.root, ["review", "--budget", "1000", "--fail-on", gate]).code, gate).toBe(1);
    expect(duoctl(p.root, ["review", "--budget", "1000", "--record"]).code).toBe(1);
    expect(records(p.root)).toEqual(before);
    const m = await mcp.call("duo_review_changes", { budget: 1000 });
    expect(m.isError).toBe(true);
    expect(m.structuredContent).toBeUndefined();
    expect(m.content[0]?.text).toContain("REVIEW_ANALYSIS_INCOMPLETE");
    expect((await projectReview(p.root, { diff: { from: "HEAD", to: "WORKTREE" }, budget: 1000 })).kind).toBe("failed");
    // With a budget that holds the frame the same change is reviewed (no Decision is involved: PASS with the missing-intent gap, H-80).
    const ok = duoctl(p.root, ["review", "--budget", "200000", "--json"]).json().result;
    expect(ok.verdict).toBe("PASS");
    fs.rmSync(path.join(p.root, "src/gen"), { recursive: true });
  });
});
