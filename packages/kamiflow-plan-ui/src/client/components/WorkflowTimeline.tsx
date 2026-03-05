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
    { name: "Brainstorm", hint: "clarify and propose", icon: Sparkles },
    { name: "Plan", hint: "decision complete", icon: ClipboardList },
    { name: "Build", hint: "execute scoped tasks", icon: Hammer },
    { name: "Check", hint: "evaluate PASS/BLOCK", icon: SearchCode },
    { name: "Done", hint: "archive complete", icon: CheckCircle2 }
  ] as const;
  const current = deriveStage(props.detail.summary, props.detail);
  const index = stages.findIndex((stage) => stage.name === current);
  const currentStage = index >= 0 ? stages[index] : stages[0];
  const stepStates = buildTimelineStepStates(current);
  const nextCommand = props.detail.summary.next_command || "stay";
  const nextMode = props.detail.summary.next_mode || "Plan";

  function stateLabel(state: TimelineStepState): string {
    if (state === "done") {
      return "Completed";
    }
    if (state === "current") {
      return "Active";
    }
    return "Next";
  }

  return (
    <div class="phase-stack">
      <div class="phase-current-summary">
        <p class="phase-current-kicker">Current focus</p>
        <div class="phase-current-head">
          <strong class="phase-current-name">{currentStage.name}</strong>
          <span class="phase-current-chip">{nextCommand} next</span>
        </div>
        <p class="phase-current-description">{currentStage.hint}</p>
        <p class="phase-next-cue">
          <span class="phase-next-label">Next step</span>
          <span class="inline-code-chip">{nextCommand}</span>
          <span class="phase-next-mode">in {nextMode} mode</span>
        </p>
      </div>
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
    </div>
  );
}
