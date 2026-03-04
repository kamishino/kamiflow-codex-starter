import type { PlanDetail, TimelineStepState } from "../types";
import { CheckCircle2, ClipboardList, Hammer, SearchCode, Sparkles } from "lucide-preact";
import { buildTimelineStepStates, deriveStage } from "../utils";
import { CardDescription } from "../ui/Card";
import { cn } from "../ui/cn";
import { Icon } from "../ui/Icon";

interface WorkflowTimelineProps {
  detail: PlanDetail;
}

export function WorkflowTimeline(props: WorkflowTimelineProps) {
  const stages = [
    { name: "Start", hint: "clarify and score", icon: Sparkles },
    { name: "Plan", hint: "decision complete", icon: ClipboardList },
    { name: "Build", hint: "execute scoped tasks", icon: Hammer },
    { name: "Check", hint: "evaluate PASS/BLOCK", icon: SearchCode },
    { name: "Done", hint: "archive complete", icon: CheckCircle2 }
  ] as const;
  const current = deriveStage(props.detail.summary, props.detail);
  const index = stages.findIndex((stage) => stage.name === current);
  const stepStates = buildTimelineStepStates(current);

  function stateLabel(state: TimelineStepState): string {
    if (state === "done") {
      return "Completed";
    }
    if (state === "current") {
      return "Current";
    }
    return "Next";
  }

  return (
    <ol class="phase-timeline" role="list" aria-label="Phase timeline">
      {stages.map((stage, i) => {
        const state = stepStates[i];
        return (
          <li class={cn("phase-step", "phase-step-" + state)} data-stage={stage.name.toLowerCase()} data-state={state}>
            {i < stages.length - 1 ? (
              <span class={cn("phase-connector", i < index ? "phase-connector-done" : "")} aria-hidden="true" />
            ) : null}
            <span class="phase-node" aria-hidden="true">
              <Icon icon={stage.icon} class="phase-node-icon" />
            </span>
            <div class="phase-content">
              <div class="phase-title-row">
                <h3 class="phase-title" aria-current={state === "current" ? "step" : undefined}>
                  {stage.name}
                </h3>
                <span class={cn("phase-badge", "phase-badge-" + state)}>{stateLabel(state)}</span>
              </div>
              <CardDescription class="phase-hint">{stage.hint}</CardDescription>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
