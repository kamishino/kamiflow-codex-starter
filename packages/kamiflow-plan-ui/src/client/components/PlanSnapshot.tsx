import { ClipboardCheck, Gauge, ListTodo } from "lucide-preact";
import type { PlanDetail } from "../types";
import { parseChecklist } from "../utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { ScrollArea } from "../ui/ScrollArea";

interface PlanSnapshotProps {
  detail: PlanDetail;
}

export function PlanSnapshot(props: PlanSnapshotProps) {
  const detail = props.detail;
  const summary = detail.summary;
  const tasks = parseChecklist(detail.sections["Implementation Tasks"]);
  const acs = parseChecklist(detail.sections["Acceptance Criteria"]);
  const tasksDone = tasks.filter((item) => item.checked).length;
  const acsDone = acs.filter((item) => item.checked).length;
  const totalChecklist = tasks.length + acs.length;
  const completedChecklist = tasksDone + acsDone;
  const completion = totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0;
  const tasksProgress = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;
  const acceptanceProgress = acs.length > 0 ? Math.round((acsDone / acs.length) * 100) : 0;

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
    <>
      <div class="meta-inline-row">
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

      <div class="progress-scale-row">
        {progressScale("Tasks", tasksProgress, tasksDone, tasks.length, ListTodo, "tasks")}
        {progressScale("Acceptance", acceptanceProgress, acsDone, acs.length, ClipboardCheck, "acceptance")}
        {progressScale("Completion", completion, completedChecklist, totalChecklist, Gauge, "completion")}
      </div>

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
    </>
  );
}
