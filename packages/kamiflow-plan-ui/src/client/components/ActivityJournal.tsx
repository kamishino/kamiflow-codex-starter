import type { ActivityFilter, ActivityItem } from "../types";
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
          <div class="activity-head">
            <time>{formatClock(item.ts)}</time>
            <span class={`activity-tag activity-tag-${item.tone}`}>{item.eventLabel}</span>
          </div>
          <div class="activity-message">{item.message}</div>
          {item.detail ? <pre>{item.detail}</pre> : null}
        </li>
      ))}
    </>
  );
}
