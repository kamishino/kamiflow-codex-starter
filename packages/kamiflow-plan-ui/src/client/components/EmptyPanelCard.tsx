import { Alert, AlertDescription, AlertTitle } from "../ui/Alert";

interface EmptyPanelCardProps {
  reason: string;
  nextStep: string;
}

export function EmptyPanelCard(props: EmptyPanelCardProps) {
  return (
    <Alert class="empty-panel">
      <AlertTitle>{props.reason}</AlertTitle>
      <AlertDescription>{props.nextStep}</AlertDescription>
    </Alert>
  );
}
