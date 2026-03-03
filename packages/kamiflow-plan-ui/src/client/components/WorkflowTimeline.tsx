import type { PlanDetail } from "../types";
import { deriveStage } from "../utils";

interface WorkflowTimelineProps {
  detail: PlanDetail;
}

export function WorkflowTimeline(props: WorkflowTimelineProps) {
  const stages = ["Start", "Plan", "Build", "Check", "Done"];
  const current = deriveStage(props.detail.summary, props.detail);
  const index = stages.indexOf(current);

  return (
    <>
      {stages.map((stage, i) => {
        const classes = ["stage"];
        if (i < index) {
          classes.push("stage-done");
        }
        if (i === index) {
          classes.push("stage-active");
        }

        const hint =
          stage === "Start"
            ? "clarify and score"
            : stage === "Plan"
              ? "decision complete"
              : stage === "Build"
                ? "execute scoped tasks"
                : stage === "Check"
                  ? "evaluate PASS/BLOCK"
                  : "archive complete";

        return (
          <div class={classes.join(" ")}>
            <strong>{stage}</strong>
            <small>{hint}</small>
          </div>
        );
      })}
    </>
  );
}
