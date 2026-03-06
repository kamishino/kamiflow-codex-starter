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

export function ActivityJournal(props: ActivityJournalProps) {
  type TimelineActionType = "status" | "blockers" | "next_step" | "other";
  interface TimelineEntry {
    key: string;
    actionType: TimelineActionType;
    actionLabel: string;
    message: string;
    raw: string;
    timeMs: number | null;
    timeLabel: string;
    lineIndex: number;
  }

  function compactText(value: string, max = 120): string {
    const singleLine = String(value || "").replace(/\s+/g, " ").trim();
    if (!singleLine) {
      return "";
    }
    return singleLine.length > max ? singleLine.slice(0, max - 3) + "..." : singleLine;
  }

  function parseWipTimeline(sectionText: string, max = 10): TimelineEntry[] {
    const lines = String(sectionText || "").split(/\r?\n/);
    const parsed: TimelineEntry[] = [];

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
      parsed.push({
        key: `${index}-${actionType}-${message.slice(0, 24)}`,
        actionType,
        actionLabel,
        message,
        raw,
        timeMs,
        timeLabel,
        lineIndex: index
      });
    }

    if (!parsed.length) {
      return [];
    }

    parsed.sort((a, b) => {
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

    return parsed.slice(0, max);
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
              <div class="activity-overview-metrics">
                <Badge class="activity-summary-badge activity-summary-badge-success" tone="success">
                  Stage {timelineStage}
                </Badge>
                <Badge class="activity-summary-badge activity-summary-badge-fail" tone="default">
                  Next {nextCommand}
                </Badge>
              </div>
            </div>
            <div class="activity-progress-strip">
              <div class="activity-progress-kv activity-progress-kv-tasks">
                <span>Tasks</span>
                <strong>{tasksDone}/{tasksLeaves.length}</strong>
              </div>
              <div class="activity-progress-kv activity-progress-kv-acceptance">
                <span>Acceptance</span>
                <strong>{acceptanceDone}/{acceptanceLeaves.length}</strong>
              </div>
              <div class="activity-progress-kv activity-progress-kv-updated">
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
                <span class="activity-summary-state activity-summary-state-running">Live</span>
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
                timelineItems.map((item) => (
                  <li class={`activity-timeline-item activity-timeline-item-${item.actionType}`} key={item.key}>
                    <div class="activity-timeline-head">
                      <Badge class={`activity-timeline-badge activity-timeline-badge-${item.actionType}`} tone={timelineBadgeTone(item.actionType)}>
                        <Icon icon={resolveTimelineIcon(item.actionType)} />
                        {item.actionLabel}
                      </Badge>
                      <time>{item.timeLabel}</time>
                    </div>
                    <p class="activity-timeline-message" title={item.raw}>
                      {renderInlineMarkdown(compactText(item.message, 240), { projectDir: props.projectDir, enableFileLinks: true })}
                    </p>
                  </li>
                ))
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
                Debug Events ({visibleItems.length})
              </summary>
              {!visibleItems.length ? (
                <p class="activity-debug-empty">No events for this filter.</p>
              ) : (
                <ul class="activity-debug-list">
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
                </ul>
              )}
            </details>
          </CardContent>
        </Card>
      </li>
    </>
  );
}
