import type { ComponentChildren, JSX } from "preact";
import { cn } from "./cn.js";

interface BaseProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children: ComponentChildren;
}

export function Card(props: BaseProps) {
  const { children, class: className, ...rest } = props;
  return <div {...rest} class={cn("ui-card", className)}>{children}</div>;
}

export function CardHeader(props: BaseProps) {
  const { children, class: className, ...rest } = props;
  return <div {...rest} class={cn("ui-card-header", className)}>{children}</div>;
}

export function CardTitle(props: { children: ComponentChildren; class?: string }) {
  return <h3 class={cn("ui-card-title", props.class)}>{props.children}</h3>;
}

export function CardDescription(props: { children: ComponentChildren; class?: string }) {
  return <p class={cn("ui-card-description", props.class)}>{props.children}</p>;
}

export function CardContent(props: BaseProps) {
  const { children, class: className, ...rest } = props;
  return <div {...rest} class={cn("ui-card-content", className)}>{children}</div>;
}

export function CardFooter(props: BaseProps) {
  const { children, class: className, ...rest } = props;
  return <div {...rest} class={cn("ui-card-footer", className)}>{children}</div>;
}
