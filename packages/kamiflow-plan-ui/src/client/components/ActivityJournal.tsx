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
  function isRuntimeEvent(eventType: string): boolean {
    return eventType.startsWith("codex_run_") || eventType.startsWith("runlog_");
  }

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

  function routeLabel(value: string | undefined): string {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) {
      return "unknown";
    }
    return normalized;
  }

  function onboardingLabel(value: string | undefined): string {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) {
      return "unknown";
    }
    return normalized.replace(/_/g, " ");
  }

  const successCount = props.items.filter((item) => item.tone === "ok").length;
  const failCount = props.items.filter((item) => item.tone === "error").length;
  const latestNowEvent =
    props.items.find((item) => item.meta?.run_state && item.meta.run_state !== "IDLE") ||
    props.items.find((item) => isRuntimeEvent(item.eventType)) ||
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
    props.items.find((item) => isRuntimeEvent(item.eventType) || item.eventType.startsWith("plan_")) || null;
  const blockerEvent = props.items.find((item) => Boolean(item.meta?.blocker) || item.tone === "error") || null;
  const blockerText = compactText(blockerEvent?.meta?.blocker || blockerEvent?.message || "", 96);
  const blockerSource = blockerEvent?.meta?.source || blockerEvent?.eventLabel || "none";
  const blockerTime = blockerEvent?.ts ? formatClock(blockerEvent.ts) : "-";
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
  const latestSummaryTime = currentTaskTime !== "-" ? currentTaskTime : activityTime;
  const latestReliabilityEvent =
    props.items.find((item) =>
      typeof item.meta?.route_confidence === "number" ||
      Boolean(item.meta?.guardrail) ||
      Boolean(item.meta?.fallback_route) ||
      Boolean(item.meta?.recovery_step)
    ) || null;
  const routeConfidenceValue =
    typeof latestReliabilityEvent?.meta?.route_confidence === "number"
      ? latestReliabilityEvent.meta.route_confidence
      : null;
  const routeConfidenceLabel = routeConfidenceValue === null ? "n/a" : `${Math.max(0, Math.min(5, routeConfidenceValue))}/5`;
  const selectedRoute = routeLabel(latestReliabilityEvent?.meta?.selected_route);
  const fallbackRoute = routeLabel(latestReliabilityEvent?.meta?.fallback_route);
  const guardrailLabel = latestReliabilityEvent?.meta?.guardrail || "steady";
  const recoveryStep = compactText(
    latestReliabilityEvent?.meta?.recovery_step || "No recovery action required.",
    128
  );
  const reliabilityState =
    routeConfidenceValue !== null && routeConfidenceValue < 4
      ? "warn"
      : String(currentTaskState || "").toUpperCase() === "FAIL"
        ? "error"
        : "ok";
  const reliabilityStateLabel = reliabilityState === "warn" ? "Needs attention" : reliabilityState === "error" ? "Blocked" : "Stable";
  const reliabilityStateClass = reliabilityState === "error" ? "fail" : reliabilityState;
  const reliabilityEventTime = latestReliabilityEvent?.ts ? formatClock(latestReliabilityEvent.ts) : "-";
  const latestOnboardingEvent =
    props.items.find((item) => Boolean(item.meta?.onboarding_status) || Boolean(item.meta?.onboarding_stage)) || null;
  const onboardingStatus = String(latestOnboardingEvent?.meta?.onboarding_status || "UNKNOWN").toUpperCase();
  const onboardingStage = onboardingLabel(latestOnboardingEvent?.meta?.onboarding_stage || "unknown");
  const onboardingErrorCode = latestOnboardingEvent?.meta?.onboarding_error_code || "-";
  const onboardingRecovery = compactText(latestOnboardingEvent?.meta?.onboarding_recovery || "None", 120);
  const onboardingNext = compactText(latestOnboardingEvent?.meta?.onboarding_next || "n/a", 120);
  const onboardingTime = latestOnboardingEvent?.ts ? formatClock(latestOnboardingEvent.ts) : "-";
  const onboardingStateClass =
    onboardingStatus === "PASS" ? "ok" : onboardingStatus === "BLOCK" ? "error" : "warn";
  const onboardingStateLabel =
    onboardingStatus === "PASS"
      ? "Ready"
      : onboardingStatus === "BLOCK"
        ? "Blocked"
        : onboardingStatus === "RUNNING"
          ? "In progress"
          : "Unknown";
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
            <div class="activity-overview-stack">
              <section class="activity-block activity-block-now activity-block-now-dominant">
                <p class="activity-block-title">
                  <Icon icon={Clock3} />
                  Now
                </p>
                <p class="activity-block-main activity-now-main">
                  <span class={`activity-summary-state activity-summary-state-${currentTaskState.toLowerCase()}`}>
                    {runStateLabel(currentTaskState)}
                  </span>
                  <span class="activity-now-copy">
                    <span class="activity-now-message">{currentTaskMessage}</span>
                    <small class="activity-block-meta">Updated at {latestSummaryTime}</small>
                  </span>
                </p>
              </section>
              {blockerText ? (
                <section class="activity-block activity-block-blocker">
                  <p class="activity-block-title">
                    <Icon icon={TriangleAlert} />
                    Active Blocker
                  </p>
                  <p class="activity-block-main">{blockerText}</p>
                  <small class="activity-block-meta">
                    Source: {blockerSource} | Updated at {blockerTime}
                  </small>
                </section>
              ) : null}
              <div class="activity-quick-grid">
                <section class="activity-block activity-block-phase">
                  <p class="activity-block-title">
                    <Icon icon={CheckCircle2} />
                    Plan Status
                  </p>
                  <p class="activity-block-main">{phaseLabel}</p>
                  <small class="activity-block-meta">Last transition {phaseTime}</small>
                </section>
                <section class={`activity-block activity-block-onboarding activity-block-onboarding-${onboardingStateClass}`}>
                  <p class="activity-block-title">
                    <Icon icon={Info} />
                    Onboarding
                  </p>
                  <p class="activity-block-main activity-onboarding-main">
                    <span class={`activity-summary-state activity-summary-state-${onboardingStateClass}`}>
                      {onboardingStateLabel}
                    </span>
                    <span class="activity-now-copy">
                      <span class="activity-now-message">
                        Stage: {onboardingStage} | Code: {onboardingErrorCode}
                      </span>
                      <small class="activity-block-meta">Updated at {onboardingTime}</small>
                    </span>
                  </p>
                  <small class="activity-block-meta">Recovery: {onboardingRecovery}</small>
                  <small class="activity-block-meta">Next: {onboardingNext}</small>
                </section>
                <section class="activity-block activity-block-activity">
                  <p class="activity-block-title">
                    <Icon icon={ListChecks} />
                    Activity
                  </p>
                  <p class="activity-block-main">{activityText}</p>
                  <small class="activity-block-meta">
                    Source: {activitySource} | Updated at {activityTime}
                  </small>
                </section>
                <section class={`activity-block activity-block-reliability activity-block-reliability-${reliabilityState}`}>
                  <p class="activity-block-title">
                    <Icon icon={TriangleAlert} />
                    Reliability
                  </p>
                  <p class="activity-block-main activity-reliability-main">
                    <span class={`activity-summary-state activity-summary-state-${reliabilityStateClass}`}>
                      {reliabilityStateLabel}
                    </span>
                    <span class="activity-now-copy">
                      <span class="activity-now-message">Guardrail: {guardrailLabel}</span>
                      <small class="activity-block-meta">Updated at {reliabilityEventTime}</small>
                    </span>
                  </p>
                </section>
                <section class="activity-block activity-block-route">
                  <p class="activity-block-title">
                    <Icon icon={Info} />
                    Route Rationale
                  </p>
                  <p class="activity-block-main activity-route-main">
                    <span class="activity-route-line">Selected: <strong>{selectedRoute}</strong></span>
                    <span class="activity-route-line">Confidence: <strong>{routeConfidenceLabel}</strong></span>
                    <span class="activity-route-line">Fallback: <strong>{fallbackRoute}</strong></span>
                  </p>
                  <small class="activity-block-meta">Recovery: {recoveryStep}</small>
                </section>
                <section class={`activity-block activity-block-evidence ${evidenceMissing ? "activity-block-evidence-missing" : "activity-block-evidence-ready"}`}>
                  <p class="activity-block-title">
                    <Icon icon={FileText} />
                    Evidence
                  </p>
                  <p class="activity-block-main activity-evidence-main">
                    <span class={`activity-evidence-state ${evidenceMissing ? "activity-evidence-state-missing" : "activity-evidence-state-ready"}`}>
                      {evidenceMissing ? "Needs evidence" : "Evidence ready"}
                    </span>
                    <span>{evidenceText}</span>
                  </p>
                  <small class="activity-block-meta">
                    Source: {evidenceSource} | {confidenceHint}
                  </small>
                </section>
              </div>
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
