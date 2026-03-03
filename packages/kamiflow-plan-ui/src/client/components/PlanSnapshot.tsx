import {
  Activity,
  BadgeCheck,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  Lightbulb,
  ListTodo,
  NotebookPen
} from "lucide-preact";
import type { PlanDetail } from "../types";
import { useState } from "preact/hooks";
import { parseChecklist, parseSummarySection } from "../utils";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { ScrollArea } from "../ui/ScrollArea";

interface PlanSnapshotProps {
  detail: PlanDetail;
}

function extractWipField(wip: string, key: string): string {
  const match = wip.match(new RegExp(`^- ${key}:\\s*(.*)$`, "m"));
  return (match && match[1]) || "";
}

export function PlanSnapshot(props: PlanSnapshotProps) {
  const [tab, setTab] = useState<"progress" | "context">("progress");
  const detail = props.detail;
  const tasks = parseChecklist(detail.sections["Implementation Tasks"]);
  const acs = parseChecklist(detail.sections["Acceptance Criteria"]);
  const wip = detail.sections["WIP Log"] || "";
  const startSummary = parseSummarySection(detail.sections["Start Summary"] || "");

  const wipStatus = extractWipField(wip, "Status");
  const wipBlockers = extractWipField(wip, "Blockers");
  const wipNext = extractWipField(wip, "Next step");
  const wipEvidence = extractWipField(wip, "Evidence");
  const tasksDone = tasks.filter((item) => item.checked).length;
  const acsDone = acs.filter((item) => item.checked).length;
  const totalChecklist = tasks.length + acs.length;
  const completedChecklist = tasksDone + acsDone;
  const completion = totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0;

  return (
    <>
      <div class="snapshot-tabs" role="tablist" aria-label="Snapshot views">
        <Button
          type="button"
          variant={tab === "progress" ? "default" : "ghost"}
          class={`snapshot-tab ${tab === "progress" ? "snapshot-tab-active" : ""}`}
          role="tab"
          aria-selected={tab === "progress"}
          aria-controls="snapshot-progress-panel"
          onClick={() => setTab("progress")}
        >
          <Icon icon={Gauge} />
          Progress
        </Button>
        <Button
          type="button"
          variant={tab === "context" ? "default" : "ghost"}
          class={`snapshot-tab ${tab === "context" ? "snapshot-tab-active" : ""}`}
          role="tab"
          aria-selected={tab === "context"}
          aria-controls="snapshot-context-panel"
          onClick={() => setTab("context")}
        >
          <Icon icon={FolderKanban} />
          Context
        </Button>
      </div>

      {tab === "progress" ? (
        <div id="snapshot-progress-panel" role="tabpanel">
          <Card class="done-summary-card">
            <CardHeader>
              <CardTitle>
                <Icon icon={BadgeCheck} />
                Done So Far
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="done-summary-grid">
                <div class="done-item">
                  <span>
                    <Icon icon={ListTodo} />
                    Implementation Tasks
                  </span>
                  <strong>
                    {tasksDone}/{tasks.length || 0}
                  </strong>
                </div>
                <div class="done-item">
                  <span>
                    <Icon icon={ClipboardCheck} />
                    Acceptance Criteria
                  </span>
                  <strong>
                    {acsDone}/{acs.length || 0}
                  </strong>
                </div>
                <div class="done-item">
                  <span>
                    <Icon icon={Gauge} />
                    Overall Completion
                  </span>
                  <strong>{completion}%</strong>
                </div>
                <div class="done-item">
                  <span>
                    <Icon icon={Activity} />
                    Current Status
                  </span>
                  <Badge tone={wipStatus ? "muted" : "warning"}>{wipStatus || "Not updated"}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div class="snapshot-column">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Icon icon={ListTodo} />
                  Implementation Tasks
                </CardTitle>
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
                <CardTitle>
                  <Icon icon={ClipboardCheck} />
                  Acceptance Criteria
                </CardTitle>
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
        </div>
      ) : (
        <div id="snapshot-context-panel" role="tabpanel">
          <div class="snapshot-column">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Icon icon={Lightbulb} />
                  Start Summary
                </CardTitle>
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
                <CardTitle>
                  <Icon icon={NotebookPen} />
                  WIP Log
                </CardTitle>
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
        </div>
      )}
    </>
  );
}
