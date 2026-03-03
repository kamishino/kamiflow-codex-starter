import { AlertTriangle, CheckCircle2, Compass, Hash, ListChecks, Route } from "lucide-preact";
import type { PlanDetail } from "../types";
import { Badge } from "../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Icon } from "../ui/Icon";

interface PlanHealthProps {
  detail: PlanDetail;
}

export function PlanHealth(props: PlanHealthProps) {
  const summary = props.detail.summary;
  return (
    <div class="stats-grid">
      <Card class="stat-card">
        <CardHeader>
          <CardTitle class="stat-label">
            <Icon icon={Hash} />
            Plan ID
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="stat-value">{summary.plan_id}</div>
        </CardContent>
      </Card>
      <Card class="stat-card">
        <CardHeader>
          <CardTitle class="stat-label">
            <Icon icon={Compass} />
            Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge tone="muted">{summary.status}</Badge>
        </CardContent>
      </Card>
      <Card class="stat-card">
        <CardHeader>
          <CardTitle class="stat-label">
            <Icon icon={summary.decision === "GO" ? CheckCircle2 : AlertTriangle} />
            Decision
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge tone={summary.decision === "GO" ? "success" : "warning"}>{summary.decision}</Badge>
        </CardContent>
      </Card>
      <Card class="stat-card">
        <CardHeader>
          <CardTitle class="stat-label">
            <Icon icon={Route} />
            Mode
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="stat-value">
            {summary.selected_mode} -&gt; {summary.next_mode}
          </div>
        </CardContent>
      </Card>
      <Card class="stat-card">
        <CardHeader>
          <CardTitle class="stat-label">
            <Icon icon={ListChecks} />
            Next Command
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge>{summary.next_command}</Badge>
        </CardContent>
      </Card>
      <Card class="stat-card">
        <CardHeader>
          <CardTitle class="stat-label">
            <Icon icon={AlertTriangle} />
            Validation Errors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Badge tone={props.detail.errors?.length ? "danger" : "success"}>{String(props.detail.errors?.length || 0)}</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
