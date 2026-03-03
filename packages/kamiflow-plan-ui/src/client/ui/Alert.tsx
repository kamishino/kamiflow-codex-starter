import type { ComponentChildren } from "preact";
import { cn } from "./cn";

type AlertTone = "default" | "warning" | "danger";

interface AlertProps {
  children: ComponentChildren;
  class?: string;
  tone?: AlertTone;
}

export function Alert(props: AlertProps) {
  const tone = props.tone || "default";
  const toneClass =
    tone === "warning" ? "ui-alert-warning" : tone === "danger" ? "ui-alert-danger" : "ui-alert-default";
  return <div class={cn("ui-alert", toneClass, props.class)}>{props.children}</div>;
}

export function AlertTitle(props: { children: ComponentChildren; class?: string }) {
  return <strong class={cn("ui-alert-title", props.class)}>{props.children}</strong>;
}

export function AlertDescription(props: { children: ComponentChildren; class?: string }) {
  return <div class={cn("ui-alert-description", props.class)}>{props.children}</div>;
}
