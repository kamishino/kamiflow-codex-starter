import { AlertCircle, CheckCircle2, Clock3, Info, ListChecks, MoveRight, TriangleAlert } from "lucide-preact";
import type { ActivityDensity, ActivityFilter, ActivityItem, PlanDetail } from "../types";
import { renderInlineMarkdown } from "../lib/inline-markdown";
import { Badge } from "../ui/Badge";
import { Card, CardContent } from "../ui/Card";
import { Icon } from "../ui/Icon";
import {
  activityMatchesFilter,
  collectChecklistLeaves,
  deriveStage,
  formatClock,
  parseChecklistTree
} from "../utils";

interface ActivityJournalProps {
  items: ActivityItem[];
  filter: ActivityFilter;
  density: ActivityDensity;
  detail: PlanDetail | null;
  projectDir: string;
}

type TimelineActionType = "status" | "blockers" | "next_step" | "other";

interface TimelineAction {
  key: string;
  actionType: TimelineActionType;
  actionLabel: string;
  message: string;
  raw: string;
  lineIndex: number;
}

interface TimelineGroup {
  key: string;
  timeMs: number | null;
  timeLabel: string;
  lineIndex: number;
  actions: TimelineAction[];
}

interface PinnedBlocker {
  key: string;
  routeKey: string;
  message: string;
  detail: string;
  timeLabel: string;
  traceHint: string | null;
}

function compactText(value: string, max = 120): string {
  const singleLine = String(value || "").replace(/\s+/g, " ").trim();
  if (!singleLine) {
    return "";
  }
  return singleLine.length > max ? singleLine.slice(0, max - 3) + "..." : singleLine;
}

function eventFamily(eventType: string): string {
  const key = String(eventType || "").toLowerCase();
  if (key.startsWith("runlog_")) return "runlog";
  if (key.startsWith("codex_run_")) return "codex";
  if (key.startsWith("plan_")) return "plan";
  return key || "unknown";
}

function normalizeRouteKey(value: string): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "unknown";
}

function resolveRouteKey(item: ActivityItem): string {
  const selectedRoute = item.meta?.selected_route;
  if (selectedRoute) {
    return normalizeRouteKey(selectedRoute);
  }
  const phase = item.meta?.phase;
  if (phase) {
    return normalizeRouteKey(phase);
  }
  return normalizeRouteKey(eventFamily(item.eventType));
}

function resolveTraceHint(routeKey: string | null | undefined): string | null {
  const key = String(routeKey || "").toLowerCase();
  if (!key) {
    return null;
  }
  if (key.includes("build") || key.includes("fix")) {
    return "Implementation Tasks";
  }
  if (key.includes("check")) {
    return "Acceptance Criteria";
  }
  if (key.includes("start") || key.includes("plan") || key.includes("research") || key.includes("brainstorm")) {
    return "Start/Plan Context";
  }
  return null;
}

function parseWipTimeline(sectionText: string, max = 8): TimelineGroup[] {
  const lines = String(sectionText || "").split(/\r?\n/);
  const groupedByTime = new Map<string, TimelineGroup>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("- ")) {
      continue;
    }
    let raw = line.replace(/^- /, "").trim();
    if (!raw) {
      continue;
    }

    let timeMs: number | null = null;
    const tsMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T[0-9:.+\-Z]+)\s*-\s*(.+)$/i);
    if (tsMatch) {
      const parsedTs = Date.parse(tsMatch[1]);
      if (!Number.isNaN(parsedTs)) {
        timeMs = parsedTs;
      }
      raw = tsMatch[2].trim();
    }

    const actionMatch = raw.match(/^(Status|Blockers|Next step)\s*:\s*(.+)$/i);
    const actionRaw = actionMatch?.[1]?.toLowerCase() || "";
    const actionType: TimelineActionType =
      actionRaw === "status"
        ? "status"
        : actionRaw === "blockers"
          ? "blockers"
          : actionRaw === "next step"
            ? "next_step"
            : "other";
    const actionLabel =
      actionType === "status"
        ? "Status"
        : actionType === "blockers"
          ? "Blockers"
          : actionType === "next_step"
            ? "Next step"
            : "Update";
    const message = actionMatch?.[2]?.trim() || raw;
    const timeLabel = timeMs === null ? "n/a" : formatClock(new Date(timeMs).toISOString());
    const action: TimelineAction = {
      key: `${index}-${actionType}-${message.slice(0, 24)}`,
      actionType,
      actionLabel,
      message,
      raw,
      lineIndex: index
    };
    const timeKey = timeMs === null ? `line:${index}` : `time:${timeMs}`;
    const group = groupedByTime.get(timeKey);
    if (group) {
      group.actions.push(action);
      group.lineIndex = Math.max(group.lineIndex, index);
    } else {
      groupedByTime.set(timeKey, {
        key: timeKey,
        timeMs,
        timeLabel,
        lineIndex: index,
        actions: [action]
      });
    }
  }

  const groups = [...groupedByTime.values()];
  if (!groups.length) {
    return [];
  }

  groups.sort((a, b) => {
    if (a.timeMs !== null && b.timeMs !== null && a.timeMs !== b.timeMs) {
      return b.timeMs - a.timeMs;
    }
    if (a.timeMs !== null && b.timeMs === null) {
      return -1;
    }
    if (a.timeMs === null && b.timeMs !== null) {
      return 1;
    }
    return b.lineIndex - a.lineIndex;
  });

  const actionPriority: Record<TimelineActionType, number> = {
    next_step: 0,
    blockers: 1,
    status: 2,
    other: 3
  };
  for (const group of groups) {
    group.actions.sort((a, b) => {
      const priorityDiff = actionPriority[a.actionType] - actionPriority[b.actionType];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return b.lineIndex - a.lineIndex;
    });
  }

  return groups.slice(0, max);
}

function timelineBadgeTone(actionType: TimelineActionType): "success" | "warning" | "danger" | "default" {
  if (actionType === "status") {
    return "success";
  }
  if (actionType === "blockers") {
    return "danger";
  }
  if (actionType === "next_step") {
    return "warning";
  }
  return "default";
}

function resolveTimelineIcon(actionType: TimelineActionType) {
  if (actionType === "status") return CheckCircle2;
  if (actionType === "blockers") return TriangleAlert;
  if (actionType === "next_step") return MoveRight;
  return Info;
}

function timelineNodeType(group: TimelineGroup): TimelineActionType {
  if (group.actions.some((item) => item.actionType === "blockers")) {
    return "blockers";
  }
  if (group.actions.some((item) => item.actionType === "next_step")) {
    return "next_step";
  }
  if (group.actions.some((item) => item.actionType === "status")) {
    return "status";
  }
  return "other";
}

function inferRunState(item: ActivityItem): "RUNNING" | "SUCCESS" | "FAIL" | "IDLE" {
  const runState = item.meta?.run_state;
  if (runState === "RUNNING" || runState === "SUCCESS" || runState === "FAIL" || runState === "IDLE") {
    return runState;
  }
  if (item.eventType.endsWith("_started")) {
    return "RUNNING";
  }
  if (item.eventType.endsWith("_completed")) {
    return "SUCCESS";
  }
  if (item.eventType.endsWith("_failed") || item.tone === "error") {
    return "FAIL";
  }
  return "IDLE";
}

function isBlockingItem(item: ActivityItem, runState: "RUNNING" | "SUCCESS" | "FAIL" | "IDLE"): boolean {
  if (runState === "FAIL") {
    return true;
  }
  if (item.meta?.blocker && String(item.meta.blocker).trim()) {
    return true;
  }
  return /\b(block|blocked|fail|failed|error)\b/i.test(item.message);
}

function resolveRuntimeSignalState(items: ActivityItem[]): { label: string; className: string; icon: typeof Clock3 } {
  const sourceItem = items.find((item) => item.meta?.run_state || item.eventType.startsWith("runlog_") || item.eventType.startsWith("codex_run_"));
  const state = sourceItem ? inferRunState(sourceItem) : "IDLE";
  if (state === "RUNNING") {
    return { label: "Working", className: "activity-summary-state-running", icon: MoveRight };
  }
  if (state === "SUCCESS") {
    return { label: "Done", className: "activity-summary-state-success", icon: CheckCircle2 };
  }
  if (state === "FAIL") {
    return { label: "Blocked", className: "activity-summary-state-fail", icon: TriangleAlert };
  }
  return { label: "Idle", className: "activity-summary-state-idle", icon: Clock3 };
}

function collectPinnedBlockers(items: ActivityItem[], max = 2): PinnedBlocker[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  const resolvedRouteKeys = new Set<string>();
  const pinnedRouteKeys = new Set<string>();
  const output: PinnedBlocker[] = [];

  for (const item of sorted) {
    const routeKey = resolveRouteKey(item);
    const runState = inferRunState(item);
    if (runState === "SUCCESS") {
      resolvedRouteKeys.add(routeKey);
      continue;
    }
    if (!isBlockingItem(item, runState)) {
      continue;
    }
    if (resolvedRouteKeys.has(routeKey) || pinnedRouteKeys.has(routeKey)) {
      continue;
    }
    pinnedRouteKeys.add(routeKey);
    output.push({
      key: `${item.ts}-${item.eventType}-${routeKey}`,
      routeKey,
      message: compactText(item.meta?.blocker || item.message || "Blocked", 220),
      detail: item.detail || "",
      timeLabel: item.ts ? formatClock(item.ts) : "-",
      traceHint: resolveTraceHint(routeKey)
    });
    if (output.length >= max) {
      break;
    }
  }

  return output;
}

export function ActivityJournal(props: ActivityJournalProps) {
  const isCompact = props.density !== "expanded";
  const timelineStage = props.detail ? deriveStage(props.detail.summary, props.detail) : "Unknown";
  const nextCommand = props.detail?.summary?.next_command || "unknown";
  const planUpdatedAt = props.detail?.summary?.updated_at || "";
  const runtimeSignal =
    props.items.find((item) => item.eventType.startsWith("runlog_") || item.eventType.startsWith("codex_run_")) ||
    props.items.find((item) => item.eventType.startsWith("plan_")) ||
    props.items[0] ||
    null;
  const runtimeRouteKey = runtimeSignal ? resolveRouteKey(runtimeSignal) : "";
  const runtimeMessage = compactText(runtimeSignal?.message || "No runtime signal yet.", isCompact ? 180 : 600);
  const runtimeTime = runtimeSignal?.ts ? formatClock(runtimeSignal.ts) : "-";
  const runtimePhase = runtimeSignal ? runtimeSignal.meta?.phase || runtimeRouteKey : "unknown";
  const runtimeNext =
    runtimeSignal?.meta?.recovery_step ||
    runtimeSignal?.meta?.onboarding_next ||
    runtimeSignal?.meta?.fallback_route ||
    runtimeSignal?.meta?.blocker ||
    runtimeSignal?.message ||
    "No current action.";
  const runtimeTraceHint = resolveTraceHint(runtimeRouteKey);

  const tasksLeaves = props.detail
    ? collectChecklistLeaves(parseChecklistTree(props.detail.sections["Implementation Tasks"] || ""))
    : [];
  const acceptanceLeaves = props.detail
    ? collectChecklistLeaves(parseChecklistTree(props.detail.sections["Acceptance Criteria"] || ""))
    : [];
  const tasksDone = tasksLeaves.filter((item) => item.checked).length;
  const acceptanceDone = acceptanceLeaves.filter((item) => item.checked).length;
  const timelineItems = parseWipTimeline(props.detail?.sections?.["WIP Log"] || "");
  const visibleItems = props.items.filter((item) => activityMatchesFilter(item.eventType, props.filter));
  const runtimeState = resolveRuntimeSignalState(props.items);
  const pinnedBlockers = collectPinnedBlockers(props.items, 2);
  const timelineTraceHint = resolveTraceHint(nextCommand);

  const resolveToneIcon = (tone: ActivityItem["tone"]) => {
    if (tone === "ok") return CheckCircle2;
    if (tone === "warn") return TriangleAlert;
    if (tone === "error") return AlertCircle;
    return Info;
  };

  return (
    <>
      <li class="activity-overview-item">
        <Card class={`activity-overview-card activity-overview-card-timeline activity-density-${props.density}`}>
          <CardContent>
            <div class="activity-overview-head">
              <strong>Execution Timeline</strong>
              <small class="activity-overview-meta">Stage {timelineStage} | Next {nextCommand}</small>
            </div>
            <div class="activity-progress-strip">
              <div class="activity-progress-kv">
                <span>Tasks</span>
                <strong>
                  {tasksDone}/{tasksLeaves.length}
                </strong>
              </div>
              <div class="activity-progress-kv">
                <span>Acceptance</span>
                <strong>
                  {acceptanceDone}/{acceptanceLeaves.length}
                </strong>
              </div>
              <div class="activity-progress-kv">
                <span>Updated</span>
                <strong>{planUpdatedAt ? formatClock(planUpdatedAt) : "-"}</strong>
              </div>
            </div>

            <section class="activity-current-signal activity-current-summary">
              <p class="activity-current-signal-label">
                <Icon icon={Clock3} />
                Current Run Summary
              </p>
              <p class="activity-current-signal-main">
                <span class={`activity-summary-state ${runtimeState.className}`}>
                  <Icon icon={runtimeState.icon} />
                  {runtimeState.label}
                </span>
                <span class="activity-current-signal-copy">
                  <span class="activity-current-signal-message">
                    {renderInlineMarkdown(runtimeMessage, { projectDir: props.projectDir, enableFileLinks: true })}
                  </span>
                  <small class="activity-block-meta">
                    Phase {runtimePhase} | Updated at {runtimeTime}
                  </small>
                  <small class="activity-block-meta">Next action: {compactText(runtimeNext, isCompact ? 140 : 260)}</small>
                  {runtimeTraceHint ? <small class="activity-trace-hint">{runtimeTraceHint}</small> : null}
                </span>
              </p>
            </section>

            {pinnedBlockers.length ? (
              <section class="activity-pinned-blockers">
                <p class="activity-current-signal-label">
                  <Icon icon={TriangleAlert} />
                  Pinned Blockers
                </p>
                <ul class="activity-pinned-list">
                  {pinnedBlockers.map((blocker) => (
                    <li class="activity-pinned-item" key={blocker.key}>
                      <div class="activity-pinned-head">
                        <Badge tone="danger">Blocked {blocker.routeKey}</Badge>
                        <time>{blocker.timeLabel}</time>
                      </div>
                      <p class="activity-pinned-message">
                        {renderInlineMarkdown(blocker.message, { projectDir: props.projectDir, enableFileLinks: true })}
                      </p>
                      {blocker.traceHint ? <small class="activity-trace-hint">{blocker.traceHint}</small> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <ol class={`activity-timeline-list activity-timeline-list-${props.density}`}>
              {timelineItems.length ? (
                timelineItems.map((group) => {
                  const nodeType = timelineNodeType(group);
                  return (
                    <li class={`activity-timeline-node activity-timeline-node-${nodeType}`} key={group.key}>
                      <div class="activity-timeline-axis" aria-hidden="true">
                        <span class={`activity-timeline-dot activity-timeline-dot-${nodeType}`}></span>
                        <span class="activity-timeline-stem"></span>
                      </div>
                      <div class="activity-timeline-card">
                        <div class="activity-timeline-head">
                          <time>{group.timeLabel}</time>
                          <Badge class={`activity-timeline-badge activity-timeline-badge-${nodeType}`} tone={timelineBadgeTone(nodeType)}>
                            {group.actions.length} update{group.actions.length > 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <ul class="activity-timeline-action-list">
                          {group.actions.map((action) => (
                            <li class={`activity-timeline-action activity-timeline-action-${action.actionType}`} key={action.key}>
                              <span class={`activity-timeline-action-label activity-timeline-action-label-${action.actionType}`}>
                                <Icon icon={resolveTimelineIcon(action.actionType)} />
                                {action.actionLabel}
                              </span>
                              {timelineTraceHint ? <small class="activity-trace-hint">{timelineTraceHint}</small> : null}
                              <span
                                class={`activity-timeline-action-message ${isCompact ? "activity-timeline-action-message-compact" : "activity-timeline-action-message-expanded"}`}
                                title={action.raw}
                              >
                                {renderInlineMarkdown(
                                  compactText(action.message, isCompact ? 160 : 4000),
                                  { projectDir: props.projectDir, enableFileLinks: true }
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                })
              ) : (
                <li class="activity-timeline-empty">
                  <strong>No milestones yet.</strong>
                  <small>Timeline will update from WIP Log entries in the plan file.</small>
                </li>
              )}
            </ol>
          </CardContent>
        </Card>
      </li>
      <li class="activity-overview-item">
        <Card class="activity-overview-card">
          <CardContent>
            <details class="activity-debug-details" open={!isCompact}>
              <summary>
                <Icon icon={ListChecks} />
                Execution Events ({visibleItems.length})
              </summary>
              {!visibleItems.length ? (
                <p class="activity-debug-empty">No events for this filter.</p>
              ) : (
                <ul class={`activity-debug-list activity-debug-list-${props.density}`}>
                  {visibleItems.map((item) => {
                    const traceHint = resolveTraceHint(resolveRouteKey(item));
                    return (
                      <li class={`activity-item activity-item-${item.tone}`} key={`${item.ts}-${item.eventType}-${item.message.slice(0, 24)}`}>
                        <div class="activity-row">
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
                          {traceHint ? <small class="activity-trace-hint">{traceHint}</small> : null}
                          <div class="activity-message">
                            {renderInlineMarkdown(
                              compactText(item.message, isCompact ? 180 : 4000),
                              { projectDir: props.projectDir, enableFileLinks: true }
                            )}
                          </div>
                          {!isCompact && item.detail ? (
                            <details class="activity-detail">
                              <summary>View detail</summary>
                              <pre>{item.detail}</pre>
                            </details>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          </CardContent>
        </Card>
      </li>
    </>
  );
}
