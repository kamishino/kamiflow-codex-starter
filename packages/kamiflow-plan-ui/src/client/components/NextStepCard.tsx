import type { PlanDetail } from "../types";
import { evaluateStartGate } from "../utils";

interface NextStepCardProps {
  detail: PlanDetail;
  uiMode: "observer" | "operator";
}

export function NextStepCard(props: NextStepCardProps) {
  const summary = props.detail.summary;
  const planId = summary.plan_id || "<plan_id>";
  const projectId = summary.project_id || "default";
  const nextCommand = summary.next_command || "plan";
  const nextMode = summary.next_mode || "Plan";

  const recommended = `kfc flow next --project . --plan ${planId} --style narrative`;
  const applyCommand =
    nextCommand === "fix"
      ? `kfc flow apply --project . --plan ${planId} --route check --result block`
      : nextCommand === "done"
        ? `kfc flow apply --project . --plan ${planId} --route check --result pass`
        : `kfc flow apply --project . --plan ${planId} --route build --result progress`;
  const startGate = evaluateStartGate(props.detail);

  return (
    <>
      <div class="guardrail-box">
        <strong>Observer Mode</strong>
        <p class="action-hint">This UI is read-only for safety. Run commands in terminal and use this page to monitor flow.</p>
        <ul class="guardrail-list">
          <li>
            <span class="guardrail-reason">UI Mode:</span>
            <span class="guardrail-next">{props.uiMode}</span>
          </li>
          <li>
            <span class="guardrail-reason">Project:</span>
            <span class="guardrail-next">{projectId}</span>
          </li>
          <li>
            <span class="guardrail-reason">Plan:</span>
            <span class="guardrail-next">{planId}</span>
          </li>
          <li>
            <span class="guardrail-reason">Next Command:</span>
            <span class="guardrail-next">{nextCommand}</span>
          </li>
          <li>
            <span class="guardrail-reason">Next Mode:</span>
            <span class="guardrail-next">{nextMode}</span>
          </li>
          <li>
            <span class="guardrail-reason">Start Gate:</span>
            <span class="guardrail-next">{startGate.ok ? "ready" : startGate.reason}</span>
          </li>
        </ul>
      </div>
      <div class="action-section">
        <h3>Terminal Commands</h3>
        <p class="action-hint">Run these outside UI when you want to persist state changes.</p>
        <label>Get narrative next step</label>
        <pre>{recommended}</pre>
        <label>Apply state</label>
        <pre>{applyCommand}</pre>
      </div>
    </>
  );
}
