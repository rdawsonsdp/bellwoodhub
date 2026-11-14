import type { ReactNode } from "react";
import { Icon } from "./Icon";

// Every link that leaves the site opens in a new tab and says so, both
// visibly (the icon) and to screen readers (the hidden text).
export function ExternalLink({
  href,
  children,
  className,
  newTabLabel,
  showIcon = true,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  /** Translated "opens in a new tab" text. */
  newTabLabel: string;
  showIcon?: boolean;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      {showIcon && <Icon name="external" size={16} className="ml-1 inline-block align-[-2px]" />}
      <span className="sr-only"> ({newTabLabel})</span>
    </a>
  );
}
