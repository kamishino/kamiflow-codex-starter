import type { ComponentChildren, JSX } from "preact";
import { cn } from "./cn.js";

interface ScrollAreaProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function ScrollArea(props: ScrollAreaProps) {
  const { children, class: className, ...rest } = props;
  return <div {...rest} class={cn("ui-scroll-area", className)}>{children}</div>;
}
