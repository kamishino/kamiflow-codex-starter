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
              {item.detail ? <pre>{item.detail}</pre> : null}
            </CardContent>
          </Card>
        </li>
      ))}
    </>
  );
}
