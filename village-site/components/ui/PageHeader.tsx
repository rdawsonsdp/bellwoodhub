import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "./Container";
import { Icon } from "./Icon";

export type Crumb = { label: string; href?: string };

// The top of every inside page: breadcrumb trail, the page's one <h1>, and a
// short plain-language summary.
export function PageHeader({
  title,
  intro,
  crumbs,
  breadcrumbLabel,
  children,
}: {
  title: string;
  intro?: ReactNode;
  crumbs: Crumb[];
  breadcrumbLabel: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-line bg-paper">
      <Container className="py-8 sm:py-10">
        <nav aria-label={breadcrumbLabel}>
          <ol className="flex flex-wrap items-center gap-x-1 text-sm text-ink-3">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <Icon name="chevronRight" size={14} />}
                {crumb.href ? (
                  <Link href={crumb.href} className="prose-link inline-flex min-h-8 items-center">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-navy-900 sm:text-4xl">{title}</h1>
        {intro && <p className="mt-3 max-w-3xl text-lg text-ink-2">{intro}</p>}
        {children}
      </Container>
    </div>
  );
}
