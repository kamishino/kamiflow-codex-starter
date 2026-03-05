import { Workflow } from "lucide-preact";
import type { PlanDetail } from "../types";
import { buildPlanDiagramModel } from "../../lib/plan-diagram";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";

interface PlanFlowDiagramProps {
  detail: PlanDetail;
}

export function PlanFlowDiagram(props: PlanFlowDiagramProps) {
  const model = buildPlanDiagramModel({
    summary: props.detail.summary,
    sections: props.detail.sections || {}
  });

  return (
    <Card class="plan-flow-card">
      <CardHeader>
        <CardTitle>
          <Icon icon={Workflow} />
          Derived Flow Diagram
        </CardTitle>
        <p class="plan-flow-note">
          Canonical source is plan markdown. Diagram is generated from current plan state.
        </p>
      </CardHeader>
      <CardContent>
        <div class="plan-flow-track" role="list" aria-label="Derived plan flow">
          {model.phase_steps.map((step, index) => (
            <div class="plan-flow-item-wrap" role="listitem" key={step.id}>
              <div class={`plan-flow-item plan-flow-item-${step.state}`}>
                <strong>{step.label}</strong>
                <small>{step.state.toUpperCase()}</small>
              </div>
              {index < model.phase_steps.length - 1 ? <span class="plan-flow-arrow">→</span> : null}
            </div>
          ))}
        </div>

        <div class="plan-flow-metrics">
          <span class="plan-flow-metric">
            Tasks {model.tasks.done}/{model.tasks.total || 0}
          </span>
          <span class="plan-flow-metric">
            Acceptance {model.acceptance.done}/{model.acceptance.total || 0}
          </span>
          <span class={`plan-flow-metric plan-flow-metric-${model.decision === "GO" ? "go" : "nogo"}`}>
            Decision {model.decision}
          </span>
          <span class="plan-flow-metric">
            Next {model.next_command}/{model.next_mode}
          </span>
        </div>

        <details class="plan-mermaid-source">
          <summary>View Mermaid source</summary>
          <pre class="plan-mermaid-code">{model.mermaid}</pre>
        </details>
      </CardContent>
    </Card>
  );
}
