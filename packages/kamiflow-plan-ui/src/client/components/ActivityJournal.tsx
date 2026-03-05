import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-preact";
import type { ActivityFilter, ActivityItem } from "../types";
import { Badge } from "../ui/Badge";
import { Card, CardContent } from "../ui/Card";
import { Icon } from "../ui/Icon";
import { activityMatchesFilter, formatClock } from "../utils";

interface ActivityJournalProps {
  items: ActivityItem[];
  filter: ActivityFilter;
}

export function ActivityJournal(props: ActivityJournalProps) {
  const successCount = props.items.filter((item) => item.tone === "ok").length;
  const failCount = props.items.filter((item) => item.tone === "error").length;
  const latestTaskEvent =
    props.items.find((item) => item.eventType.startsWith("codex_run_")) ||
    props.items.find((item) => item.eventType.startsWith("plan_")) ||
    null;
  const currentTaskState = latestTaskEvent
    ? latestTaskEvent.tone === "ok"
      ? "SUCCESS"
      : latestTaskEvent.tone === "error"
        ? "FAIL"
        : "RUNNING"
    : "IDLE";
  const currentTaskMessage = latestTaskEvent?.message || "No current task/subtask event.";
  const visibleItems = props.items.filter((item) => activityMatchesFilter(item.eventType, props.filter));
  const resolveToneIcon = (tone: ActivityItem["tone"]) => {
    if (tone === "ok") return CheckCircle2;
    if (tone === "warn") return TriangleAlert;
    if (tone === "error") return AlertCircle;
    return Info;
  };

  if (!visibleItems.length) {
    return (
      <li class="empty-state">
        <strong>No activity for this filter.</strong>
        <small>Try another filter or wait for new events.</small>
      </li>
    );
  }

  return (
    <>
      <li class="activity-summary-item">
        <Card class="activity-summary-card">
          <CardContent>
            <div class="activity-summary-head">
              <strong>Current Task/Subtask</strong>
              <div class="activity-summary-metrics">
                <Badge class="activity-summary-badge activity-summary-badge-success" tone="success">
                  <Icon icon={CheckCircle2} />
                  SUCCESS {successCount}
                </Badge>
                <Badge class="activity-summary-badge activity-summary-badge-fail" tone="danger">
                  <Icon icon={AlertCircle} />
                  FAIL {failCount}
                </Badge>
              </div>
            </div>
            <p class="activity-summary-current">
              <span class={`activity-summary-state activity-summary-state-${currentTaskState.toLowerCase()}`}>
                {currentTaskState}
              </span>
              <span class="activity-summary-current-message">{currentTaskMessage}</span>
            </p>
          </CardContent>
        </Card>
      </li>
      {visibleItems.map((item) => (
        <li class={`activity-item activity-item-${item.tone}`}>
          <Card class="activity-card">
            <CardContent>
              <div class="activity-head">
                <time>{formatClock(item.ts)}</time>
                <Badge
                  class={`activity-tag activity-tag-${item.tone}`}
                  tone={item.tone === "ok" ? "success" : item.tone === "warn" ? "warning" : item.tone === "error" ? "danger" : "default"}
                >
                  <Icon icon={resolveToneIcon(item.tone)} />
                  {item.eventLabel}
                </Badge>
              </div>
              <div class="activity-message">{item.message}</div>
              {item.detail ? (
                <details class="activity-detail">
                  <summary>View detail</summary>
                  <pre>{item.detail}</pre>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </>
  );
}
