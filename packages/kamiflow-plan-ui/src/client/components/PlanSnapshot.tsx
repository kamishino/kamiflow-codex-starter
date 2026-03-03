import type { PlanDetail } from "../types";
import { parseChecklist, parseSummarySection } from "../utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { ScrollArea } from "../ui/ScrollArea";

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
        <Card>
          <CardHeader>
            <CardTitle>Start Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="stats-grid">
              <div class="stat-tile">
                <span>Required</span>
                <strong>{startSummary.required || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Reason</span>
                <strong>{startSummary.reason || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Selected Idea</span>
                <strong>{startSummary["selected idea"] || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Alternatives</span>
                <strong>{startSummary["alternatives considered"] || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Pre-mortem Risk</span>
                <strong>{startSummary["pre-mortem risk"] || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Handoff Confidence</span>
                <strong>{startSummary["handoff confidence"] || "-"}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>WIP Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="stats-grid four-col">
              <div class="stat-tile">
                <span>Status</span>
                <strong>{wipStatus || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Blockers</span>
                <strong>{wipBlockers || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Next step</span>
                <strong>{wipNext || "-"}</strong>
              </div>
              <div class="stat-tile">
                <span>Evidence</span>
                <strong>{wipEvidence || "-"}</strong>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div class="split-2">
        <Card>
          <CardHeader>
            <CardTitle>Implementation Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="checklist-box" id="task-box">
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
            </ScrollArea>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Acceptance Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea class="checklist-box" id="ac-box">
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
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
