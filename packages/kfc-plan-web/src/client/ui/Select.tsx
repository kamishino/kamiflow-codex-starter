import type { ComponentChildren, JSX } from "preact";
import { cn } from "./cn";

interface SelectProps extends JSX.HTMLAttributes<HTMLSelectElement> {
  children: ComponentChildren;
}

export function Select(props: SelectProps) {
  return (
    <select {...props} class={cn("ui-select", props.class)}>
      {props.children}
    </select>
  );
}
