import { AlertCircle, CheckCircle2, Clock3, Info, ListChecks, TriangleAlert } from "lucide-preact";
import type { ActivityFilter, ActivityItem, PlanDetail } from "../types";
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
}

export function ActivityJournal(props: ActivityJournalProps) {
  function compactText(value: string, max = 120): string {
    const singleLine = String(value || "").replace(/\s+/g, " ").trim();
    if (!singleLine) {
      return "";
    }
    return singleLine.length > max ? singleLine.slice(0, max - 3) + "..." : singleLine;
  }

  function parseWipMilestones(sectionText: string, max = 6): string[] {
    const lines = String(sectionText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.replace(/^- /, "").trim())
      .filter(Boolean);
    if (!lines.length) {
      return [];
    }
    return lines.slice(-max).reverse();
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
  const milestones = parseWipMilestones(props.detail?.sections?.["WIP Log"] || "");
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

            <section class="activity-block activity-block-now activity-block-now-dominant">
              <p class="activity-block-title">
                <Icon icon={Clock3} />
                Current Signal
              </p>
              <p class="activity-block-main activity-now-main">
                <span class="activity-summary-state activity-summary-state-running">Live</span>
                <span class="activity-now-copy">
                  <span class="activity-now-message">{runtimeMessage}</span>
                  <small class="activity-block-meta">Updated at {runtimeTime}</small>
                </span>
              </p>
            </section>

            <ol class="activity-timeline-list">
              {milestones.length ? (
                milestones.map((item, index) => (
                  <li class="activity-timeline-item">
                    <span class="activity-timeline-node" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div class="activity-timeline-content">
                      <p>{compactText(item, 180)}</p>
                    </div>
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
