import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requireCompleteTruth, truthAuthorityErrors } from "../loader/authority.js";
import { loadProjectTruth } from "../loader/project.js";
import type { DecisionActor } from "./files.js";
import { createDecisionService } from "./service.js";

// H-82 (T67): C261, C262, C263. The current Decision set must be complete and consistent before authority is used.
const temps: string[] = [];
afterAll(() => temps.forEach((t) => fs.rmSync(t, { recursive: true, force: true })));

const human: DecisionActor = { kind: "human", name: "Ada" };
const agent: DecisionActor = { kind: "agent", name: "codex" };
const clock = () => new Date("2026-10-11T00:00:00.000Z");

let root: string;
const abs = (p: string) => path.join(root, p);
const write = (p: string, text: string) => { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), text); };
const read = (p: string) => fs.readFileSync(abs(p), "utf8");
const edit = (p: string, from: string | RegExp, to: string) => { const before = read(p); const after = before.replace(from, to); expect(after).not.toBe(before); write(p, after); };
const service = () => createDecisionService({ root, clock });
const errors = () => truthAuthorityErrors(loadProjectTruth(root).diagnostics);
const errorCodes = () => errors().map((d) => d.code);
const D1 = ".duo-project/decisions/D-001.yaml";

/** Snapshot of the Truth files (bytes), runtime state excluded. */
const truthBytes = () => fs.readdirSync(abs(".duo-project"), { recursive: true, encoding: "utf8" }).filter((f) => !/runtime/u.test(f)).sort()
  .map((f) => [f, fs.statSync(abs(path.join(".duo-project", f))).isFile() ? read(path.join(".duo-project", f)) : "<dir>"]);

beforeEach(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "duo-integrity-")));
  temps.push(root);
  write(".duo-project/project.yaml", "schema_version: 1\nname: integrity\n");
  // D-001 confirmed through the workflow: a block Decision with a lock.
  write(D1, "id: D-001\ntitle: No legacy DB\nkind: decision\nstate: proposed\nquestion: May code import src/db/legacy-db.ts?\nanswer: No\nforbids:\n  imported_paths: [src/db/legacy-db.ts]\nenforcement: block\n");
  expect((await service().confirm(human, "D-001")).diagnostics).toEqual([]);
});

describe("H-82 Group A: current-state Decision integrity", () => {
  it("A1 a Decision confirmed through the workflow is valid and the check writes nothing", () => {
    const before = truthBytes();
    expect(errors()).toEqual([]);
    expect(requireCompleteTruth(loadProjectTruth(root)).value?.truth.decisions.map((d) => [d.id, d.state])).toEqual([["D-001", "confirmed"]]);
    expect(truthBytes()).toEqual(before);
  });

  it("A2/A3 C262 a confirmed Decision whose content no longer matches its lock fails closed, wherever the edit came from", () => {
    edit(D1, "enforcement: block", "enforcement: warn");
    const loaded = loadProjectTruth(root);
    expect(loaded.value?.truth.decisions.map((d) => d.id)).toEqual(["D-001"]); // the tolerant loader still shows it (status, doctor)
    const e = truthAuthorityErrors(loaded.diagnostics);
    expect(e.map((d) => [d.code, d.source?.path])).toEqual([["DECISION_INTEGRITY_INVALID", D1]]);
    expect(e[0]?.message).toContain("no longer matches lock.digest");
    const r = requireCompleteTruth(loaded);
    expect(r.value).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(["PROJECT_TRUTH_INVALID", "DECISION_INTEGRITY_INVALID"]);
    expect(r.diagnostics[0]?.message).toContain(D1);
  });

  it("A2 changed forbids with the old lock is the same failure", () => {
    edit(D1, /(imported_paths:[^\n]*\n?[^\n]*?)src\/db\/legacy-db\.ts/u, "$1src/db/unused.ts");
    expect(errorCodes()).toEqual(["DECISION_INTEGRITY_INVALID"]);
  });

  it("A4 C261 a locked Decision moved back to rejected or proposed by a file edit fails closed", () => {
    for (const state of ["rejected", "proposed"]) {
      edit(D1, /^state: \w+$/mu, `state: ${state}`);
      expect(errors().map((d) => d.message.includes(`its state is ${state}`))).toEqual([true]);
    }
  });

  it("A4 C261 superseded_by must name a Decision that supersedes it", async () => {
    // D-002 supersedes nothing; D-003 supersedes D-002 (a real chain from the workflow).
    write(".duo-project/decisions/D-002.yaml", "id: D-002\ntitle: Other\nkind: decision\nstate: proposed\nquestion: q2\nanswer: a2\n");
    expect((await service().confirm(human, "D-002")).diagnostics).toEqual([]);
    await service().propose(agent, { title: "Other v2", question: "q2", answer: "b2", supersedes: "D-002" });
    expect((await service().confirm(human, "P-001")).value).toMatchObject({ decisionId: "D-003", supersedes: "D-002" });
    expect(errors()).toEqual([]);
    edit(D1, /^state: confirmed$/mu, "state: superseded\nsuperseded_by: D-003");
    expect(errors().map((d) => d.message)).toEqual([expect.stringContaining("superseded_by D-003, but D-003 supersedes D-002")]);
    edit(D1, "superseded_by: D-003", "superseded_by: D-009");
    expect(errors().map((d) => d.message)).toEqual([expect.stringContaining("superseded_by D-009 is not a Decision")]);
    edit(D1, "superseded_by: D-009\n", "");
    expect(errors().map((d) => d.message)).toEqual([expect.stringContaining("superseded without superseded_by")]);
  });

  it("A4 a confirmed Decision that names superseded_by contradicts itself", () => {
    edit(D1, /^state: confirmed$/mu, "state: confirmed\nsuperseded_by: D-001");
    expect(errorCodes()).toContain("DECISION_INTEGRITY_INVALID");
  });

  it("A4 superseded_by a Decision that is only proposed is refused", () => {
    write(".duo-project/decisions/D-002.yaml", "id: D-002\ntitle: New\nkind: decision\nstate: proposed\nquestion: q\nanswer: a\nsupersedes: D-001\n");
    edit(D1, /^state: confirmed$/mu, "state: superseded\nsuperseded_by: D-002");
    expect(errors().map((d) => d.message)).toEqual([expect.stringContaining("which is proposed")]);
  });

  it("A5 supersede chains made by the workflow stay valid, with every lock unchanged", async () => {
    await service().propose(agent, { title: "v2", question: "May code import src/db/legacy-db.ts?", answer: "Only reports", supersedes: "D-001" });
    expect((await service().confirm(human, "P-001")).value).toMatchObject({ decisionId: "D-002" });
    await service().propose(agent, { title: "v3", question: "May code import src/db/legacy-db.ts?", answer: "Never", supersedes: "D-002" });
    expect((await service().confirm(human, "P-002")).value).toMatchObject({ decisionId: "D-003" });
    const loaded = requireCompleteTruth(loadProjectTruth(root));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.value?.truth.decisions.map((d) => [d.id, d.state, d.supersededBy])).toEqual([["D-001", "superseded", "D-002"], ["D-002", "superseded", "D-003"], ["D-003", "confirmed", null]]);
    for (const id of ["D-001", "D-002", "D-003"]) expect(service().verifyLock(id).value?.status).toBe("valid");
  });

  it("A8 the manual fallback without a lock keeps its contract: hand-confirmed and hand-superseded Decisions load", () => {
    write(".duo-project/decisions/D-002.yaml", "id: D-002\ntitle: Manual\nkind: decision\nstate: confirmed\nquestion: q\nanswer: a\nforbids:\n  paths: [legacy/**]\nenforcement: block\n");
    write(".duo-project/decisions/D-003.yaml", "id: D-003\ntitle: Manual old\nkind: decision\nstate: superseded\nquestion: q3\nanswer: a\n");
    write(".duo-project/decisions/D-004.yaml", "id: D-004\ntitle: Manual rejected\nkind: decision\nstate: rejected\nquestion: q4\nanswer: a\n");
    expect(errors()).toEqual([]);
    // A plain contradiction is still reported without a lock.
    write(".duo-project/decisions/D-003.yaml", "id: D-003\ntitle: Manual old\nkind: decision\nstate: superseded\nsuperseded_by: D-002\nquestion: q3\nanswer: a\n");
    expect(errors().map((d) => d.message)).toEqual([expect.stringContaining("superseded_by D-002, but D-002 supersedes nothing")]);
  });
});

describe("H-82 Group A: Decision source candidates under decisions/ (C263)", () => {
  const md = (front: string) => `---\n${front}title: No legacy DB\nstate: confirmed\nquestion: q?\nanswer: No.\nforbids:\n  dependencies: [express-session]\nenforcement: block\n---\n# Decision\n\nBody.\n`;
  const M = ".duo-project/decisions/D-100.md";

  it("A6 a Decision-like frontmatter that is not read as a Decision is an error with the file and line", () => {
    for (const front of ["id: D-100\ntype: Decision\n", "id: D-100\ntype: \" decision \"\n", "id: D-100\n", "id: D-100\ntype: adr\n", "type: DECISION\n"]) {
      write(M, md(front));
      const e = errors();
      expect(e.map((d) => [d.code, d.source?.path, d.source?.startLine])).toEqual([["DECISION_SOURCE_INVALID", M, 1]]);
      expect(requireCompleteTruth(loadProjectTruth(root)).diagnostics[0]?.code).toBe("PROJECT_TRUTH_INVALID");
    }
  });

  it("A6 an exact type: decision is read as before", () => {
    write(M, md("id: D-100\ntype: decision\n"));
    const loaded = loadProjectTruth(root);
    expect(truthAuthorityErrors(loaded.diagnostics)).toEqual([]);
    expect(loaded.value?.truth.decisions.map((d) => d.id).sort()).toEqual(["D-001", "D-100"]);
  });

  it("A7 files that are not Decision sources do not make the project invalid", () => {
    write(".duo-project/decisions/README.md", "# Decisions\n\nHow we record decisions.\n");
    write(".duo-project/decisions/notes.md", "---\ntitle: Meeting notes\nauthor: Ada\n---\n# Notes\n");
    write(".duo-project/decisions/D-101.yaml.txt", "id: D-101\nstate: confirmed\n");
    write(".duo-project/decisions/diagram.png", "not an image");
    write(".duo-project/specs/adr.md", md("id: D-102\ntype: Decision\n")); // outside decisions/: the C263 boundary does not widen
    expect(errors()).toEqual([]);
  });
});
