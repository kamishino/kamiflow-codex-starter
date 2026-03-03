import type { PlanDetail } from "../types";
import { deriveStage } from "../utils";
import { Card, CardContent, CardDescription, CardTitle } from "../ui/Card";
import { cn } from "../ui/cn";

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
          <Card class={cn(classes.join(" "), "stage-card")}>
            <CardContent class="stage-card-content">
              <CardTitle class="stage-title">{stage}</CardTitle>
              <CardDescription class="stage-hint">{hint}</CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
