import { ClipboardCheck, Gauge, ListTodo } from "lucide-preact";
import type { PlanDetail } from "../types";
import { parseChecklist } from "../utils";
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
  const tasks = parseChecklist(detail.sections["Implementation Tasks"]);
  const acs = parseChecklist(detail.sections["Acceptance Criteria"]);
  const tasksDone = tasks.filter((item) => item.checked).length;
  const acsDone = acs.filter((item) => item.checked).length;
  const totalChecklist = tasks.length + acs.length;
  const completedChecklist = tasksDone + acsDone;
  const completion = totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0;
  const tasksProgress = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;
  const acceptanceProgress = acs.length > 0 ? Math.round((acsDone / acs.length) * 100) : 0;

  function looksLikePath(value: string): boolean {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    if (/^file:\/\//i.test(text)) {
      return true;
    }
    if (/^[a-zA-Z]:[\\/]/.test(text)) {
      return true;
    }
    if (text.startsWith("./") || text.startsWith("../")) {
      return true;
    }
    if (/[\\/]/.test(text) && /\.[a-z0-9]{1,8}$/i.test(text)) {
      return true;
    }
    return false;
  }

  function toFileHref(rawPath: string): string | null {
    const text = String(rawPath || "").trim();
    if (!text) {
      return null;
    }
    if (/^file:\/\//i.test(text)) {
      return text;
    }

    let normalized = text.replace(/\\/g, "/");
    if (!/^[a-zA-Z]:\//.test(normalized) && !normalized.startsWith("/")) {
      if (!projectDir) {
        return null;
      }
      const base = projectDir.replace(/\\/g, "/").replace(/\/+$/g, "");
      normalized = `${base}/${normalized.replace(/^\.?\//, "")}`;
    }

    const href = /^[a-zA-Z]:\//.test(normalized)
      ? `file:///${normalized}`
      : `file://${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
    return encodeURI(href);
  }

  function fileLabel(filePath: string): string {
    const normalized = String(filePath || "").replace(/\\/g, "/").replace(/\/+$/g, "");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || normalized;
  }

  function renderChecklistText(text: string) {
    const pattern = /`([^`]+)`/g;
    const nodes: any[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null = null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIdx) {
        nodes.push(text.slice(lastIdx, match.index));
      }
      const candidate = String(match[1] || "").trim();
      const href = looksLikePath(candidate) ? toFileHref(candidate) : null;
      if (href) {
        nodes.push(
          <a
            class="plan-file-link"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={candidate}
          >
            {fileLabel(candidate)}
          </a>
        );
      } else {
        nodes.push(match[0]);
      }
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < text.length) {
      nodes.push(text.slice(lastIdx));
    }
    return nodes.length > 0 ? nodes : text;
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
                  <label class="checklist-item">
                    <input class="plan-check" type="checkbox" checked={item.checked} disabled />
                    <span class="checklist-text">{renderChecklistText(item.text)}</span>
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
                  <label class="checklist-item">
                    <input class="plan-check" type="checkbox" checked={item.checked} disabled />
                    <span class="checklist-text">{renderChecklistText(item.text)}</span>
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
