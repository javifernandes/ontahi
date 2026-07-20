'use client';

import type { ReactNode } from 'react';

import { cx } from '../internal/cx.js';

import { useExplorerRoutes } from './config.js';

export type ExplorerSectionNavProps = {
  currentPath?: string;
  homeHref?: string;
  headerEnd?: ReactNode;
  className?: string;
};

const normalizeCurrentPath = (path: string) => {
  const [pathname = '/'] = path.split(/[?#]/, 1);

  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '');
};

const isSectionActive = ({
  currentPath,
  href,
  exact,
}: {
  currentPath: string | undefined;
  href: string;
  exact?: boolean;
}) => {
  if (!currentPath) {
    return false;
  }

  const normalizedCurrentPath = normalizeCurrentPath(currentPath);
  const normalizedHref = normalizeCurrentPath(href);

  return exact
    ? normalizedCurrentPath === normalizedHref
    : normalizedCurrentPath === normalizedHref ||
        normalizedCurrentPath.startsWith(`${normalizedHref}/`);
};

export function ExplorerSectionNav({
  className,
  currentPath,
  headerEnd,
  homeHref,
}: ExplorerSectionNavProps) {
  const routes = useExplorerRoutes();
  const sections = [
    ...(homeHref ? [{ label: 'Home', href: homeHref, exact: true }] : []),
    { label: 'Overview', href: routes.overview, exact: true },
    { label: 'Entities', href: routes.entities },
    { label: 'Operations', href: routes.operations },
    { label: 'Tasks', href: routes.tasks },
    { label: 'Events', href: routes.events },
  ];

  return (
    <div
      className={cx(
        'flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between',
        className,
      )}
    >
      <nav aria-label='Explorer sections' className='flex flex-wrap gap-x-8 gap-y-3'>
        {sections.map(section => {
          const active = isSectionActive({
            currentPath,
            href: section.href,
            exact: section.exact,
          });

          return (
            <a
              key={`${section.label}:${section.href}`}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground',
                active && 'text-primary',
              )}
            >
              {section.label}
            </a>
          );
        })}
      </nav>
      {headerEnd ? <div className='flex justify-start md:justify-end'>{headerEnd}</div> : null}
    </div>
  );
}
