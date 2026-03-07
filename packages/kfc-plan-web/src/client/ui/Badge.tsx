import type { ComponentChildren } from "preact";
import { cn } from "./cn";

type BadgeTone = "default" | "muted" | "success" | "warning" | "danger";

interface BadgeProps {
  children: ComponentChildren;
  class?: string;
  tone?: BadgeTone;
}

export function Badge(props: BadgeProps) {
  const tone = props.tone || "default";
  const toneClass =
    tone === "success"
      ? "ui-badge-success"
      : tone === "warning"
        ? "ui-badge-warning"
        : tone === "danger"
          ? "ui-badge-danger"
          : tone === "muted"
            ? "ui-badge-muted"
            : "ui-badge-default";
  return <span class={cn("ui-badge", toneClass, props.class)}>{props.children}</span>;
}
