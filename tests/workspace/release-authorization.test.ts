/**
 * Release authorization guard (H-81, T63): the human record must name the exact candidate and hold no inserted
 * program source (the T60 incident inserted a helper's own source as the H-74 row).
 */
import { describe, expect, it } from "vitest";
import { authorizationProblems, insertedSourceLines, nonDocumentationChanges, versionPattern } from "../../scripts/release/authorization.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const ROW = "| H-81 | 2026-10-11 | DUO stable promotion. exact target `" + SHA + "`, version 0.3.0. | release |";
const CHECKLIST = "# Release checklist\n\n## 0.3.0 (H-81, stable, `v0.3.0` = `" + SHA.slice(0, 7) + "`)\n\n- [x] gates\n\n## 0.2.2\n";
const ids = (o: Partial<{ version: string; commit: string; conflictsText: string; checklistText: string }>) =>
  authorizationProblems({ version: "0.3.0", commit: SHA, conflictsText: "# x\n" + ROW + "\n", checklistText: CHECKLIST, ...o }).problems.map((p) => p.id);

describe("release authorization guard (H-81)", () => {
  it("a decision row with the full SHA and the exact version and a checklist section for the version pass", () => {
    const r = authorizationProblems({ version: "0.3.0", commit: SHA, conflictsText: ROW, checklistText: CHECKLIST });
    expect(r.problems).toEqual([]);
    expect(r.decisions).toEqual(["H-81"]);
    expect(r.checklistHeading).toContain("0.3.0");
  });

  it("the T60 incident line (a helper's own source) blocks", () => {
    const incident = "const fs=require('fs');const f='docs/conflicts.md';const s=fs.readFileSync(f,'utf8').split('\\n');";
    expect(ids({ conflictsText: ROW + "\n" + incident + "\n" })).toEqual(["inserted-source"]);
    expect(ids({ checklistText: incident + "\n## 0.3.0 (" + SHA.slice(0, 7) + ")\n" })).toEqual(["inserted-source"]);
    expect(insertedSourceLines("| C46 | CommonJS `require(\"node:test\")` is a limitation |\n- run node scripts/x.mjs\n")).toEqual([]);
    expect(insertedSourceLines("a\nimport fs from \"node:fs\";\n  process.exit(1)\n")).toEqual([2, 3]);
  });

  it("the record must name this commit and this version exactly", () => {
    expect(ids({ conflictsText: ROW.replace(SHA, SHA.slice(0, 7)) })).toEqual(["decision-record"]);
    expect(ids({ conflictsText: ROW.replace("version 0.3.0.", "version 0.3.0-rc.6.") })).toEqual(["decision-record"]);
    expect(ids({ checklistText: CHECKLIST.replace("## 0.3.0 (", "## 0.3.0-rc.6 (") })).toEqual(["checklist-record"]);
    expect(ids({ checklistText: CHECKLIST.replace(SHA.slice(0, 7), "fffffff") })).toEqual(["checklist-record"]);
    expect(ids({ commit: "abc1234" })).toContain("candidate-commit");
    expect(versionPattern("0.3.0").test("promote 0.3.0.")).toBe(true);
    expect(versionPattern("0.3.0").test("0.3.0-rc.6")).toBe(false);
    expect(versionPattern("0.3.0-rc.6").test("(0.3.0-rc.6)")).toBe(true);
  });

  it("only documentation may change between the candidate and HEAD", () => {
    expect(nonDocumentationChanges(["docs/conflicts.md", "docs/release/checklist.md", ""])).toEqual([]);
    expect(nonDocumentationChanges(["docs/x.md", "packages/core/src/index.ts", "apps/cli/package.json"])).toEqual(["packages/core/src/index.ts", "apps/cli/package.json"]);
  });
});
