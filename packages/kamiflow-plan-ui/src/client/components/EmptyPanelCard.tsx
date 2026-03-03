import { CircleAlert } from "lucide-preact";
import { Alert, AlertDescription, AlertTitle } from "../ui/Alert";
import { Icon } from "../ui/Icon";

interface EmptyPanelCardProps {
  reason: string;
  nextStep: string;
}

export function EmptyPanelCard(props: EmptyPanelCardProps) {
  return (
    <Alert class="empty-panel">
      <AlertTitle>
        <Icon icon={CircleAlert} />
        {props.reason}
      </AlertTitle>
      <AlertDescription>{props.nextStep}</AlertDescription>
    </Alert>
  );
}
