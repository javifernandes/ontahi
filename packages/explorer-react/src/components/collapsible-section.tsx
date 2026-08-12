import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../internal/cx.js';

export const ExplorerSubsectionTitle = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <h3 className={cx('text-xs font-semibold uppercase tracking-[0.18em] text-primary', className)}>
    {children}
  </h3>
);

export const ExplorerCollapsibleSection = ({
  title,
  children,
  defaultOpen = true,
  className,
  contentClassName,
  summaryAside,
  description,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  summaryAside?: ReactNode;
  description?: ReactNode;
}) => (
  <details
    className={cx('group grid gap-3 rounded-md bg-background/40', className)}
    open={defaultOpen}
  >
    <summary className='grid cursor-pointer gap-2 py-1 marker:content-none'>
      <div className='flex items-center gap-2'>
        <ChevronRight
          className='size-4 text-muted-foreground transition-transform group-open:rotate-90'
          aria-hidden='true'
        />
        <ExplorerSubsectionTitle>{title}</ExplorerSubsectionTitle>
        {summaryAside ? <div className='ml-auto'>{summaryAside}</div> : null}
      </div>
      {description ? <div className='pl-6'>{description}</div> : null}
    </summary>
    <div className={cx('grid gap-3 pl-6', contentClassName)}>{children}</div>
  </details>
);
