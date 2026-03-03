import type { PlanDetail } from "../types";
import { parseChecklist, parseSummarySection } from "../utils";

interface PlanSnapshotProps {
  detail: PlanDetail;
}

function extractWipField(wip: string, key: string): string {
  const match = wip.match(new RegExp(`^- ${key}:\\s*(.*)$`, "m"));
  return (match && match[1]) || "";
}

export function PlanSnapshot(props: PlanSnapshotProps) {
  const detail = props.detail;
  const tasks = parseChecklist(detail.sections["Implementation Tasks"]);
  const acs = parseChecklist(detail.sections["Acceptance Criteria"]);
  const wip = detail.sections["WIP Log"] || "";
  const startSummary = parseSummarySection(detail.sections["Start Summary"] || "");

  const wipStatus = extractWipField(wip, "Status");
  const wipBlockers = extractWipField(wip, "Blockers");
  const wipNext = extractWipField(wip, "Next step");
  const wipEvidence = extractWipField(wip, "Evidence");

  return (
    <>
      <div class="split-2">
        <div>
          <h3>Start Summary</h3>
          <div class="keyvals">
            <div class="kv">
              <span>Required</span>
              <strong>{startSummary.required || "-"}</strong>
            </div>
            <div class="kv">
              <span>Reason</span>
              <strong>{startSummary.reason || "-"}</strong>
            </div>
            <div class="kv">
              <span>Selected Idea</span>
              <strong>{startSummary["selected idea"] || "-"}</strong>
            </div>
            <div class="kv">
              <span>Alternatives</span>
              <strong>{startSummary["alternatives considered"] || "-"}</strong>
            </div>
            <div class="kv">
              <span>Pre-mortem Risk</span>
              <strong>{startSummary["pre-mortem risk"] || "-"}</strong>
            </div>
            <div class="kv">
              <span>Handoff Confidence</span>
              <strong>{startSummary["handoff confidence"] || "-"}</strong>
            </div>
          </div>
        </div>
        <div>
          <h3>WIP Log</h3>
          <div class="keyvals">
            <div class="kv">
              <span>Status</span>
              <strong>{wipStatus || "-"}</strong>
            </div>
            <div class="kv">
              <span>Blockers</span>
              <strong>{wipBlockers || "-"}</strong>
            </div>
            <div class="kv">
              <span>Next step</span>
              <strong>{wipNext || "-"}</strong>
            </div>
            <div class="kv">
              <span>Evidence</span>
              <strong>{wipEvidence || "-"}</strong>
            </div>
          </div>
        </div>
      </div>
      <div class="split-2">
        <div>
          <h3>Implementation Tasks</h3>
          <div class="checklist-box" id="task-box">
            {tasks.length ? (
              tasks.map((item) => (
                <label>
                  <input type="checkbox" checked={item.checked} disabled />
                  {item.text}
                </label>
              ))
            ) : (
              <small>No task checklist found.</small>
            )}
          </div>
        </div>
        <div>
          <h3>Acceptance Criteria</h3>
          <div class="checklist-box" id="ac-box">
            {acs.length ? (
              acs.map((item) => (
                <label>
                  <input type="checkbox" checked={item.checked} disabled />
                  {item.text}
                </label>
              ))
            ) : (
              <small>No acceptance checklist found.</small>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
