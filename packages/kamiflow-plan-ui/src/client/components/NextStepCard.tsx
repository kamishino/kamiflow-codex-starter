import type { PlanDetail } from "../types";
import { evaluateStartGate } from "../utils";
import { Alert, AlertDescription, AlertTitle } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Separator } from "../ui/Separator";

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
      <Alert tone="warning">
        <AlertTitle>Observer Mode</AlertTitle>
        <AlertDescription class="action-hint">
          This UI is read-only for safety. Run commands in terminal and use this page to monitor flow.
        </AlertDescription>
        <ul class="guardrail-list compact-list">
          <li>
            <span class="guardrail-reason">UI Mode:</span>
            <Badge tone="muted">{props.uiMode}</Badge>
          </li>
          <li>
            <span class="guardrail-reason">Project:</span>
            <span class="guardrail-next mono">{projectId}</span>
          </li>
          <li>
            <span class="guardrail-reason">Plan:</span>
            <span class="guardrail-next mono">{planId}</span>
          </li>
          <li>
            <span class="guardrail-reason">Next Command:</span>
            <Badge>{nextCommand}</Badge>
          </li>
          <li>
            <span class="guardrail-reason">Next Mode:</span>
            <Badge tone="muted">{nextMode}</Badge>
          </li>
          <li>
            <span class="guardrail-reason">Start Gate:</span>
            <Badge tone={startGate.ok ? "success" : "danger"}>{startGate.ok ? "ready" : startGate.reason}</Badge>
          </li>
        </ul>
      </Alert>
      <Separator class="section-gap" />
      <Card class="terminal-card">
        <CardHeader>
          <CardTitle>Terminal Commands</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="action-hint">Run these outside UI when you want to persist state changes.</p>
          <label>Get narrative next step</label>
          <pre>{recommended}</pre>
          <label>Apply state</label>
          <pre>{applyCommand}</pre>
        </CardContent>
      </Card>
    </>
  );
}
