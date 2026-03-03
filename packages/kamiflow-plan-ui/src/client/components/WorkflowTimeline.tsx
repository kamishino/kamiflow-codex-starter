import type { PlanDetail } from "../types";
import { CheckCircle2, ClipboardList, Hammer, SearchCode, Sparkles } from "lucide-preact";
import { deriveStage } from "../utils";
import { Card, CardContent, CardDescription, CardTitle } from "../ui/Card";
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

        return (
          <Card class={cn(classes.join(" "), "stage-card")} data-stage={stage.name.toLowerCase()}>
            <CardContent class="stage-card-content">
              <div class="stage-title-row">
                <Icon icon={stage.icon} class="stage-icon" />
                <CardTitle class="stage-title">{stage.name}</CardTitle>
              </div>
              <CardDescription class="stage-hint">{stage.hint}</CardDescription>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
