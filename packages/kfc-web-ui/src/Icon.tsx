import type { JSX } from "preact";
import type { LucideIcon } from "lucide-preact";
import { cn } from "./cn.js";

interface IconProps extends Omit<JSX.SVGAttributes<SVGSVGElement>, "size"> {
  icon: LucideIcon;
  size?: number;
}

export function Icon(props: IconProps) {
  const { icon: Lucide, size = 15, class: className, ...rest } = props;
  const LucideComponent = Lucide as unknown as (props: JSX.SVGAttributes<SVGSVGElement> & { size?: number }) => JSX.Element;
  return <LucideComponent size={size} strokeWidth={2} class={cn("ui-icon", className)} aria-hidden="true" {...rest} />;
}
