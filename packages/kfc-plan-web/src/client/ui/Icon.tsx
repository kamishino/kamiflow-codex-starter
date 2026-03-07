import type { JSX } from "preact";
import type { LucideIcon } from "lucide-preact";
import { cn } from "./cn";

interface IconProps extends Omit<JSX.SVGAttributes<SVGSVGElement>, "size"> {
  icon: LucideIcon;
  size?: number;
}

export function Icon(props: IconProps) {
  const { icon: Lucide, size = 15, class: className, ...rest } = props;
  return <Lucide size={size} strokeWidth={2} class={cn("ui-icon", className)} aria-hidden="true" {...rest} />;
}
