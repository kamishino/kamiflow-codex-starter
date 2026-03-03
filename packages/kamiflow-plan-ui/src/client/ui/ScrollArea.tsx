import type { ComponentChildren } from "preact";
import { cn } from "./cn";

interface ScrollAreaProps {
  children: ComponentChildren;
  class?: string;
}

export function ScrollArea(props: ScrollAreaProps) {
  return <div class={cn("ui-scroll-area", props.class)}>{props.children}</div>;
}
