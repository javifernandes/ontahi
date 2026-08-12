'use client';

import type { ReactNode } from 'react';

import type { ExplorerTaskRunSourceLoader } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { ExplorerProvider } from './config.js';
import { ExplorerSectionNav } from './section-nav.js';
import type { ExplorerThemePreference } from './theme.js';

export type ExplorerShellProps = {
  children: ReactNode;
  basePath?: string;
  currentPath?: string;
  homeHref?: string;
  headerEnd?: ReactNode;
  loadTaskRunSource?: ExplorerTaskRunSourceLoader;
  theme?: ExplorerThemePreference;
  className?: string;
  contentClassName?: string;
};

export function ExplorerShell({
  basePath,
  children,
  className,
  contentClassName,
  currentPath,
  headerEnd,
  homeHref,
  loadTaskRunSource,
  theme,
}: ExplorerShellProps) {
  return (
    <ExplorerProvider basePath={basePath} loadTaskRunSource={loadTaskRunSource} theme={theme}>
      <main className={cx('min-h-screen bg-muted/20 px-6 py-8 text-foreground', className)}>
        <div className={cx('mx-auto grid max-w-7xl gap-6', contentClassName)}>
          <ExplorerSectionNav currentPath={currentPath} homeHref={homeHref} headerEnd={headerEnd} />
          {children}
        </div>
      </main>
    </ExplorerProvider>
  );
}
