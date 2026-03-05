import { AlertCircle, CheckCircle2, Clock3, FileText, Info, ListChecks, TriangleAlert } from "lucide-preact";
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
  function compactText(value: string, max = 120): string {
    const singleLine = String(value || "").replace(/\s+/g, " ").trim();
    if (!singleLine) {
      return "";
    }
    return singleLine.length > max ? singleLine.slice(0, max - 3) + "..." : singleLine;
  }

  function runStateLabel(state: string): string {
    if (state === "SUCCESS") return "Success";
    if (state === "FAIL") return "Blocked";
    if (state === "RUNNING") return "Running";
    return "Idle";
  }

  const successCount = props.items.filter((item) => item.tone === "ok").length;
  const failCount = props.items.filter((item) => item.tone === "error").length;
  const latestNowEvent =
    props.items.find((item) => item.meta?.run_state && item.meta.run_state !== "IDLE") ||
    props.items.find((item) => item.eventType.startsWith("codex_run_")) ||
    props.items.find((item) => item.eventType.startsWith("plan_")) ||
    null;
  const currentTaskState = latestNowEvent?.meta?.run_state
    ? latestNowEvent.meta.run_state
    : latestNowEvent
      ? latestNowEvent.tone === "ok"
        ? "SUCCESS"
        : latestNowEvent.tone === "error"
          ? "FAIL"
          : "RUNNING"
      : "IDLE";
  const currentTaskMessage = compactText(latestNowEvent?.message || "No current task/subtask event.");
  const currentTaskTime = latestNowEvent?.ts ? formatClock(latestNowEvent.ts) : "-";
  const latestPhaseEvent = props.items.find((item) => Boolean(item.meta?.phase)) || null;
  const phaseLabel = latestPhaseEvent?.meta?.phase || "Unknown";
  const phaseTime = latestPhaseEvent?.ts ? formatClock(latestPhaseEvent.ts) : "-";
  const latestActivityEvent =
    props.items.find((item) => item.eventType.startsWith("codex_run_") || item.eventType.startsWith("plan_")) || null;
  const blockerEvent = props.items.find((item) => Boolean(item.meta?.blocker) || item.tone === "error") || null;
  const blockerText = compactText(blockerEvent?.meta?.blocker || blockerEvent?.message || "", 96);
  const activityText = compactText(latestActivityEvent?.message || "No recent activity events.");
  const activitySource = latestActivityEvent?.meta?.source || latestActivityEvent?.eventLabel || "none";
  const activityTime = latestActivityEvent?.ts ? formatClock(latestActivityEvent.ts) : "-";
  const evidenceEvent = props.items.find((item) => Boolean(item.meta?.evidence) || Boolean(item.detail)) || null;
  const evidenceText = compactText(evidenceEvent?.meta?.evidence || evidenceEvent?.detail || "No evidence yet.");
  const evidenceSource = evidenceEvent?.meta?.source || evidenceEvent?.eventLabel || "none";
  const evidenceMissing = !evidenceEvent || evidenceText.toLowerCase() === "no evidence yet.";
  const confidenceLevel =
    currentTaskState === "FAIL"
      ? "low"
      : currentTaskState === "SUCCESS" && !evidenceMissing
        ? "high"
        : currentTaskState === "RUNNING"
          ? "medium"
          : currentTaskState === "SUCCESS"
            ? "medium"
            : "unknown";
  const confidenceLabel =
    confidenceLevel === "high"
      ? "High"
      : confidenceLevel === "medium"
        ? "Medium"
        : confidenceLevel === "low"
          ? "Low"
          : "Unknown";
  const confidenceHint =
    confidenceLevel === "high"
      ? "Evidence and recent execution are aligned."
      : confidenceLevel === "medium"
        ? "Execution is moving; keep validating evidence."
        : confidenceLevel === "low"
          ? "Active blockers or failures reduce confidence."
          : "No recent evidence to score confidence.";
  const visibleItems = props.items.filter((item) => activityMatchesFilter(item.eventType, props.filter));
  const resolveToneIcon = (tone: ActivityItem["tone"]) => {
    if (tone === "ok") return CheckCircle2;
    if (tone === "warn") return TriangleAlert;
    if (tone === "error") return AlertCircle;
    return Info;
  };

  return (
    <>
      <li class="activity-overview-item">
        <Card class="activity-overview-card">
          <CardContent>
            <div class="activity-overview-head">
              <strong>Flow Snapshot</strong>
              <div class="activity-overview-metrics">
                <Badge class="activity-summary-badge activity-summary-badge-success" tone="success">
                  <Icon icon={CheckCircle2} />
                  Success {successCount}
                </Badge>
                <Badge class="activity-summary-badge activity-summary-badge-fail" tone="danger">
                  <Icon icon={AlertCircle} />
                  Fail {failCount}
                </Badge>
                <Badge class={`activity-summary-badge activity-confidence-chip activity-confidence-${confidenceLevel}`} tone="default">
                  Confidence {confidenceLabel}
                </Badge>
              </div>
            </div>
            <div class="activity-overview-grid">
              <section class="activity-block activity-block-now">
                <p class="activity-block-title">
                  <Icon icon={Clock3} />
                  Now
                </p>
                <p class="activity-block-main">
                  <span class={`activity-summary-state activity-summary-state-${currentTaskState.toLowerCase()}`}>
                    {runStateLabel(currentTaskState)}
                  </span>
                  <span class="activity-summary-current-message">{currentTaskMessage}</span>
                </p>
                <small class="activity-block-meta">Updated at {currentTaskTime}</small>
              </section>
              <section class="activity-block activity-block-phase">
                <p class="activity-block-title">
                  <Icon icon={CheckCircle2} />
                  Plan Status
                </p>
                <p class="activity-block-main">{phaseLabel}</p>
                <small class="activity-block-meta">Last transition {phaseTime}</small>
              </section>
              <section class="activity-block activity-block-activity">
                <p class="activity-block-title">
                  <Icon icon={ListChecks} />
                  Activity
                </p>
                <p class="activity-block-main">{activityText}</p>
                <small class="activity-block-meta">
                  {blockerText ? `Blocker: ${blockerText}` : `Source: ${activitySource}`} | Updated at {activityTime}
                </small>
              </section>
              <section class={`activity-block activity-block-evidence ${evidenceMissing ? "activity-block-evidence-missing" : "activity-block-evidence-ready"}`}>
                <p class="activity-block-title">
                  <Icon icon={FileText} />
                  Evidence
                </p>
                <p class="activity-block-main">
                  <span class={`activity-evidence-state ${evidenceMissing ? "activity-evidence-state-missing" : "activity-evidence-state-ready"}`}>
                    {evidenceMissing ? "Needs evidence" : "Evidence ready"}
                  </span>
                  <span>{evidenceText}</span>
                </p>
                <small class="activity-block-meta">
                  Source: {evidenceSource} | Confidence note: {confidenceHint}
                </small>
              </section>
            </div>
          </CardContent>
        </Card>
      </li>
      {!visibleItems.length ? (
        <li class="empty-state">
          <strong>No activity for this filter.</strong>
          <small>Try another filter or wait for new events.</small>
        </li>
      ) : null}
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
