import type { ActivityFilter, ActivityItem } from "../types";
import { Badge } from "../ui/Badge";
import { Card, CardContent } from "../ui/Card";
import { activityMatchesFilter, formatClock } from "../utils";

interface ActivityJournalProps {
  items: ActivityItem[];
  filter: ActivityFilter;
}

export function ActivityJournal(props: ActivityJournalProps) {
  const visibleItems = props.items.filter((item) => activityMatchesFilter(item.eventType, props.filter));
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
                  {item.eventLabel}
                </Badge>
              </div>
              <div class="activity-message">{item.message}</div>
              {item.detail ? <pre>{item.detail}</pre> : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </>
  );
}
