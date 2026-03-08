import type { ComponentChildren, JSX } from "preact";
import { cn } from "./cn";

type BadgeTone = "default" | "muted" | "success" | "warning" | "danger";

interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  children: ComponentChildren;
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
  const { children, tone: _tone, class: className, ...rest } = props;
  return <span {...rest} class={cn("ui-badge", toneClass, className)}>{children}</span>;
}
