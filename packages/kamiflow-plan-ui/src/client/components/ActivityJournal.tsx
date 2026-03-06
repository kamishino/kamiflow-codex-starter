import { AlertCircle, CheckCircle2, Clock3, Info, ListChecks, MoveRight, TriangleAlert } from "lucide-preact";
import type { ActivityFilter, ActivityItem, PlanDetail } from "../types";
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

export function ActivityJournal(props: ActivityJournalProps) {
  function compactText(value: string, max = 120): string {
    const singleLine = String(value || "").replace(/\s+/g, " ").trim();
    if (!singleLine) {
      return "";
    }
    return singleLine.length > max ? singleLine.slice(0, max - 3) + "..." : singleLine;
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

  const timelineStage = props.detail ? deriveStage(props.detail.summary, props.detail) : "Unknown";
  const nextCommand = props.detail?.summary?.next_command || "unknown";
  const planUpdatedAt = props.detail?.summary?.updated_at || "";
  const runtimeSignal =
    props.items.find((item) => item.eventType.startsWith("runlog_") || item.eventType.startsWith("codex_run_")) ||
    props.items.find((item) => item.eventType.startsWith("plan_")) ||
    null;
  const runtimeMessage = compactText(runtimeSignal?.message || "No runtime signal yet.");
  const runtimeTime = runtimeSignal?.ts ? formatClock(runtimeSignal.ts) : "-";
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

  const resolveToneIcon = (tone: ActivityItem["tone"]) => {
    if (tone === "ok") return CheckCircle2;
    if (tone === "warn") return TriangleAlert;
    if (tone === "error") return AlertCircle;
    return Info;
  };

  return (
    <>
      <li class="activity-overview-item">
        <Card class="activity-overview-card activity-overview-card-timeline">
          <CardContent>
            <div class="activity-overview-head">
              <strong>Execution Timeline</strong>
              <small class="activity-overview-meta">Stage {timelineStage} | Next {nextCommand}</small>
            </div>
            <div class="activity-progress-strip">
              <div class="activity-progress-kv">
                <span>Tasks</span>
                <strong>{tasksDone}/{tasksLeaves.length}</strong>
              </div>
              <div class="activity-progress-kv">
                <span>Acceptance</span>
                <strong>{acceptanceDone}/{acceptanceLeaves.length}</strong>
              </div>
              <div class="activity-progress-kv">
                <span>Updated</span>
                <strong>{planUpdatedAt ? formatClock(planUpdatedAt) : "-"}</strong>
              </div>
            </div>

            <section class="activity-current-signal">
              <p class="activity-current-signal-label">
                <Icon icon={Clock3} />
                Current Signal
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
                  <small class="activity-block-meta">Updated at {runtimeTime}</small>
                </span>
              </p>
            </section>

            <ol class="activity-timeline-list">
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
                              <span class="activity-timeline-action-message" title={action.raw}>
                                {renderInlineMarkdown(compactText(action.message, 260), { projectDir: props.projectDir, enableFileLinks: true })}
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
            <details class="activity-debug-details">
              <summary>
                <Icon icon={ListChecks} />
                Execution Events ({visibleItems.length})
              </summary>
              {!visibleItems.length ? (
                <p class="activity-debug-empty">No events for this filter.</p>
              ) : (
                <ul class="activity-debug-list">
                  {visibleItems.map((item) => (
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
                        <div class="activity-message">{item.message}</div>
                        {item.detail ? (
                          <details class="activity-detail">
                            <summary>View detail</summary>
                            <pre>{item.detail}</pre>
                          </details>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </CardContent>
        </Card>
      </li>
    </>
  );
}
