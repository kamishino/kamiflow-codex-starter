import { cn } from "./cn.js";

interface SeparatorProps {
  class?: string;
}

export function Separator(props: SeparatorProps) {
  return <div class={cn("ui-separator", props.class)} role="separator" />;
}
