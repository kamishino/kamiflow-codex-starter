import type { ComponentChildren, JSX } from "preact";
import { cn } from "./cn";

type ButtonVariant = "default" | "outline" | "ghost";

interface ButtonProps extends JSX.HTMLAttributes<HTMLButtonElement> {
  children: ComponentChildren;
  variant?: ButtonVariant;
}

export function Button(props: ButtonProps) {
  const variant = props.variant || "default";
  const variantClass =
    variant === "outline" ? "ui-button-outline" : variant === "ghost" ? "ui-button-ghost" : "ui-button-default";
  return (
    <button {...props} class={cn("ui-button", variantClass, props.class)}>
      {props.children}
    </button>
  );
}
