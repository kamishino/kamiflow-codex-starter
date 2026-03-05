import { ClipboardCheck, Gauge, ListTodo } from "lucide-preact";
import type { PlanDetail } from "../types";
import { collectChecklistLeaves, parseChecklistTree } from "../utils";
import { renderInlineMarkdown } from "../lib/inline-markdown";
import { PlanFlowDiagram } from "./PlanFlowDiagram";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { ScrollArea } from "../ui/ScrollArea";

interface PlanSnapshotProps {
  detail: PlanDetail;
  projectDir: string;
}

export function PlanSnapshot(props: PlanSnapshotProps) {
  const detail = props.detail;
  const summary = detail.summary;
  const projectDir = props.projectDir;
  const tasksTree = parseChecklistTree(detail.sections["Implementation Tasks"]);
  const acsTree = parseChecklistTree(detail.sections["Acceptance Criteria"]);
  const taskLeaves = collectChecklistLeaves(tasksTree);
  const acLeaves = collectChecklistLeaves(acsTree);
  const tasksDone = taskLeaves.filter((item) => item.checked).length;
  const acsDone = acLeaves.filter((item) => item.checked).length;
  const totalChecklist = taskLeaves.length + acLeaves.length;
  const completedChecklist = tasksDone + acsDone;
  const completion = totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0;
  const tasksProgress = taskLeaves.length > 0 ? Math.round((tasksDone / taskLeaves.length) * 100) : 0;
  const acceptanceProgress = acLeaves.length > 0 ? Math.round((acsDone / acLeaves.length) * 100) : 0;

  function renderChecklistNodes(
    nodes: Array<{ checked: boolean; text: string; children: any[] }>,
    depth = 0,
    pathPrefix = "node"
  ) {
    return nodes.map((item, index) => {
      const key = `${pathPrefix}-${index}`;
      return (
        <div class="checklist-node" key={key}>
          <label class="checklist-item checklist-item-nested" style={{ paddingInlineStart: `${depth * 16}px` }}>
            <input class="plan-check" type="checkbox" checked={item.checked} disabled />
            <span class="checklist-text">{renderInlineMarkdown(item.text, { projectDir, enableFileLinks: true })}</span>
          </label>
          {item.children.length ? (
            <div class="checklist-children">{renderChecklistNodes(item.children, depth + 1, key)}</div>
          ) : null}
        </div>
      );
    });
  }

  function progressScale(
    label: string,
    value: number,
    done: number,
    total: number,
    icon: typeof ListTodo,
    tone: "tasks" | "acceptance" | "completion"
  ) {
    return (
      <div class={`progress-scale-card progress-scale-${tone}`}>
        <div class="progress-scale-head">
          <div class="progress-scale-title">
            <Icon icon={icon} />
            <span>{label}</span>
          </div>
          <strong class="progress-scale-value">{value}%</strong>
        </div>
        <div
          class="progress-scale-track"
          role="progressbar"
          aria-label={label + " progress"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          <span class="progress-scale-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
        <small class="progress-scale-meta">
          {done}/{total || 0} complete
        </small>
      </div>
    );
  }

  return (
    <div class="snapshot-stack">
      <Card class="snapshot-progress-card">
        <CardHeader class="snapshot-progress-header">
          <CardTitle>Progress Overview</CardTitle>
          <p class="snapshot-progress-copy">Track execution progress first, then review checklist details.</p>
        </CardHeader>
        <CardContent>
          <div class="progress-scale-row">
            {progressScale("Tasks", tasksProgress, tasksDone, taskLeaves.length, ListTodo, "tasks")}
            {progressScale("Acceptance", acceptanceProgress, acsDone, acLeaves.length, ClipboardCheck, "acceptance")}
            {progressScale("Completion", completion, completedChecklist, totalChecklist, Gauge, "completion")}
          </div>
        </CardContent>
      </Card>

      <PlanFlowDiagram detail={detail} />

      <p class="snapshot-section-label">Execution Checklists</p>
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
              {tasksTree.length ? (
                <div class="checklist-tree">{renderChecklistNodes(tasksTree, 0, "task")}</div>
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
              {acsTree.length ? (
                <div class="checklist-tree">{renderChecklistNodes(acsTree, 0, "ac")}</div>
              ) : (
                <small>No acceptance checklist found.</small>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div class="meta-inline-row meta-inline-row-muted">
        <span>
          <strong>Plan</strong> {summary.plan_id}
        </span>
        <span>
          <strong>Status</strong> {summary.status}
        </span>
        <span>
          <strong>Decision</strong> {summary.decision}
        </span>
        <span>
          <strong>Mode</strong> {summary.selected_mode}
        </span>
        <span>
          <strong>Next</strong> {summary.next_command}/{summary.next_mode}
        </span>
        <span>
          <strong>Updated</strong> {summary.updated_at}
        </span>
      </div>
    </div>
  );
}
