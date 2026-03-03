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

      <div class="progress-inline-row">
        <div class="progress-inline-item">
          <Icon icon={ListTodo} />
          <span>
            Tasks {tasksDone}/{tasks.length || 0}
          </span>
        </div>
        <div class="progress-inline-item">
          <Icon icon={ClipboardCheck} />
          <span>
            Acceptance {acsDone}/{acs.length || 0}
          </span>
        </div>
        <div class="progress-inline-item">
          <Icon icon={Gauge} />
          <span>Completion {completion}%</span>
        </div>
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
