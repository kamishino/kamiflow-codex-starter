import type { PlanDetail } from "../types";

interface PlanHealthProps {
  detail: PlanDetail;
}

export function PlanHealth(props: PlanHealthProps) {
  const summary = props.detail.summary;
  return (
    <div class="keyvals">
      <div class="kv">
        <span>Plan ID</span>
        <strong>{summary.plan_id}</strong>
      </div>
      <div class="kv">
        <span>Status</span>
        <strong>{summary.status}</strong>
      </div>
      <div class="kv">
        <span>Decision</span>
        <strong>{summary.decision}</strong>
      </div>
      <div class="kv">
        <span>Mode</span>
        <strong>
          {summary.selected_mode} -&gt; {summary.next_mode}
        </strong>
      </div>
      <div class="kv">
        <span>Next Command</span>
        <strong>{summary.next_command}</strong>
      </div>
      <div class="kv">
        <span>Validation Errors</span>
        <strong>{String(props.detail.errors?.length || 0)}</strong>
      </div>
    </div>
  );
}
