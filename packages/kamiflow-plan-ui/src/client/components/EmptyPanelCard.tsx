interface EmptyPanelCardProps {
  reason: string;
  nextStep: string;
}

export function EmptyPanelCard(props: EmptyPanelCardProps) {
  return (
    <div class="empty-panel">
      <strong>{props.reason}</strong>
      <small>{props.nextStep}</small>
    </div>
  );
}
