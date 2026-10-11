/**
 * Current-state integrity of the authoritative Decision set (H-82, T67: C261, C262). The Decision Lock is a
 * mistake detector over content fields only (ADR-013, AC-009-03), and R-LOCK in Review sees only the Decision
 * files inside a diff. A Decision edited and committed outside a review range, or retired by editing its
 * lifecycle fields, would otherwise keep or lose authority silently. These checks read the current files only:
 * no Git history, no signature, no new field. Each problem is an error, so requireCompleteTruth() (H-75) keeps
 * review, context, the adoption baseline and the Decision lifecycle from deciding on that Truth, while status,
 * doctor and decision list still read and show it.
 *
 * A lock is the evidence that a Decision went through the confirm workflow. Without a lock the Decision is the
 * manual fallback of ADR-013 and only plain contradictions are reported; a deleted lock cannot be told from that
 * fallback, and a recomputed digest is out of scope (10-security).
 */
import { createDiagnostic, type Diagnostic } from "../diagnostics.js";
import type { Decision } from "../domain/model.js";
import { compareUtf8 } from "../order.js";
import { decisionLockDigest } from "./digest.js";

const LIFECYCLE_STATES = new Set(["confirmed", "superseded"]);
const FIX = "Fix the file (for example restore it from Git) or change the Decision through duoctl decision; DUO does not change it.";

function problem(d: Decision, message: string): Diagnostic {
  return createDiagnostic("DECISION_INTEGRITY_INVALID", `${d.id}: ${message} ${FIX}`, d.location);
}

/** Lock and lifecycle problems of the Decisions as they are now (sorted by Decision ID). */
export function decisionAuthorityDiagnostics(decisions: readonly Decision[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  const byId = new Map<string, Decision>();
  for (const d of decisions) if (!byId.has(d.id)) byId.set(d.id, d);
  for (const d of [...decisions].sort((a, b) => compareUtf8(a.id, b.id))) {
    const locked = d.lock !== undefined;
    if (locked && LIFECYCLE_STATES.has(d.state)) {
      const expected = decisionLockDigest(d);
      if (d.lock?.digest !== expected) {
        out.push(problem(d, `its content no longer matches lock.digest (the content fields changed after it was confirmed; expected ${expected}).`));
      }
    }
    if (locked && !LIFECYCLE_STATES.has(d.state)) {
      out.push(problem(d, `it has a lock (it was confirmed) but its state is ${d.state}; a confirmed Decision stays confirmed or is superseded by another Decision.`));
    }
    if (d.state === "confirmed" && d.supersededBy !== null) {
      out.push(problem(d, `it is confirmed but names superseded_by ${d.supersededBy}.`));
    }
    if (d.state === "superseded") {
      if (d.supersededBy === null) {
        if (locked) out.push(problem(d, "it is superseded without superseded_by; a superseded Decision names the Decision that superseded it."));
        continue;
      }
      const by = byId.get(d.supersededBy);
      if (by === undefined) out.push(problem(d, `superseded_by ${d.supersededBy} is not a Decision.`));
      else if (by.supersedes !== d.id) out.push(problem(d, `superseded_by ${by.id}, but ${by.id} ${by.supersedes === null ? "supersedes nothing" : `supersedes ${by.supersedes}`}.`));
      else if (!LIFECYCLE_STATES.has(by.state)) out.push(problem(d, `superseded_by ${by.id}, which is ${by.state}; only a confirmed Decision supersedes another.`));
    }
  }
  return out;
}
