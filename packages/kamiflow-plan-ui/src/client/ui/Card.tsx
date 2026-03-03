import type { ComponentChildren } from "preact";
import { cn } from "./cn";

interface BaseProps {
  children: ComponentChildren;
  class?: string;
}

export function Card(props: BaseProps) {
  return <div class={cn("ui-card", props.class)}>{props.children}</div>;
}

export function CardHeader(props: BaseProps) {
  return <div class={cn("ui-card-header", props.class)}>{props.children}</div>;
}

export function CardTitle(props: BaseProps) {
  return <h3 class={cn("ui-card-title", props.class)}>{props.children}</h3>;
}

export function CardDescription(props: BaseProps) {
  return <p class={cn("ui-card-description", props.class)}>{props.children}</p>;
}

export function CardContent(props: BaseProps) {
  return <div class={cn("ui-card-content", props.class)}>{props.children}</div>;
}

export function CardFooter(props: BaseProps) {
  return <div class={cn("ui-card-footer", props.class)}>{props.children}</div>;
}
