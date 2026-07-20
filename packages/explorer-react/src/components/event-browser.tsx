'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import type { ExplorerEventDescriptor } from '../contracts/index.js';
import { cx } from '../internal/cx.js';

import { useExplorerConfig, useExplorerRoutes } from './config.js';
import { ExplorerEventDetail } from './entity-detail-panels.js';

export type ExplorerEventBrowserProps = {
  events: ExplorerEventDescriptor[];
  selectedEventType?: string;
  className?: string;
};

const allDomainsFilter = 'all';

const getEventSearchText = (event: ExplorerEventDescriptor) =>
  `${event.type} ${event.domain} ${event.relatedEntities.join(' ')}`.toLowerCase();

const getSelectedEventType = (
  events: ExplorerEventDescriptor[],
  selectedEventType: string | undefined,
) => {
  if (selectedEventType && events.some(event => event.type === selectedEventType)) {
    return selectedEventType;
  }

  return events[0]?.type ?? '';
};

const getEventTypeFromPathname = (pathname: string, basePath: string) => {
  const prefix = `${basePath}/events/`;

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const encodedEventType = pathname.slice(prefix.length).split('/')[0];

  return encodedEventType ? decodeURIComponent(encodedEventType) : undefined;
};

export function ExplorerEventBrowser({
  events,
  selectedEventType,
  className,
}: ExplorerEventBrowserProps) {
  const { basePath } = useExplorerConfig();
  const routes = useExplorerRoutes();
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState(allDomainsFilter);
  const [selectedType, setSelectedType] = useState(() =>
    getSelectedEventType(events, selectedEventType),
  );
  const domainOptions = useMemo(
    () => [
      { value: allDomainsFilter, label: 'All domains' },
      ...Array.from(new Set(events.map(event => event.domain)))
        .sort()
        .map(option => ({ value: option, label: option })),
    ],
    [events],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(event => {
        const matchesDomain = domain === allDomainsFilter || event.domain === domain;

        return matchesDomain && getEventSearchText(event).includes(query.toLowerCase());
      }),
    [domain, events, query],
  );
  const selectedEvent =
    events.find(event => event.type === selectedType) ?? filteredEvents[0] ?? events[0];

  useEffect(() => {
    setSelectedType(currentSelectedType => {
      if (selectedEventType && events.some(event => event.type === selectedEventType)) {
        return selectedEventType;
      }

      if (events.some(event => event.type === currentSelectedType)) {
        return currentSelectedType;
      }

      return events[0]?.type ?? '';
    });
  }, [events, selectedEventType]);

  useEffect(() => {
    const handlePopState = () => {
      const eventType = getEventTypeFromPathname(globalThis.location.pathname, basePath);

      if (eventType && events.some(event => event.type === eventType)) {
        setSelectedType(eventType);
      }
    };

    globalThis.addEventListener('popstate', handlePopState);

    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [basePath, events]);

  const selectEvent = (clickEvent: MouseEvent<HTMLAnchorElement>, eventType: string) => {
    if (
      clickEvent.defaultPrevented ||
      clickEvent.metaKey ||
      clickEvent.ctrlKey ||
      clickEvent.shiftKey ||
      clickEvent.altKey ||
      clickEvent.button !== 0
    ) {
      return;
    }

    clickEvent.preventDefault();
    setSelectedType(eventType);
    globalThis.history.pushState(null, '', routes.event(eventType));
  };

  return (
    <div className={cx('grid gap-6', className)}>
      <header>
        <h1 className='text-3xl font-semibold tracking-tight'>Event Catalog</h1>
        <p className='mt-2 max-w-3xl text-sm text-muted-foreground'>
          Current domain event kinds and payload contracts. Live event debugging will build on this
          catalog.
        </p>
      </header>

      <div className='grid items-start gap-8 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'>
        <section className='min-w-0 grid content-start gap-4'>
          <div className='flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row'>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='Search events, domains, related entities'
              aria-label='Search events'
              className='min-h-10 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary'
            />
            <select
              value={domain}
              onChange={event => setDomain(event.target.value)}
              aria-label='Filter events by domain'
              className='min-h-10 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary md:w-[180px]'
            >
              {domainOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className='min-w-0 overflow-hidden rounded-lg border bg-card'>
            {filteredEvents.map(event => (
              <a
                key={event.type}
                href={routes.event(event.type)}
                onClick={clickEvent => selectEvent(clickEvent, event.type)}
                className={cx(
                  'grid w-full gap-2 border-b px-5 py-4 text-left last:border-0 hover:bg-accent/70',
                  selectedEvent?.type === event.type && 'bg-primary/10',
                )}
              >
                <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'>
                  <span className='truncate font-mono text-sm font-semibold text-foreground'>
                    {event.type}
                  </span>
                  <span className='rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground'>
                    {event.domain}
                  </span>
                </div>
                <div className='text-xs text-muted-foreground'>
                  {event.payloadFields.length} payload fields · {event.relatedEntities.length}{' '}
                  related entities · {event.handlers.length} handlers
                </div>
              </a>
            ))}
            {filteredEvents.length === 0 ? (
              <p className='px-5 py-8 text-sm text-muted-foreground'>No events match.</p>
            ) : null}
          </div>
        </section>

        {selectedEvent ? (
          <aside className='min-w-0 self-start overflow-hidden rounded-lg border bg-card p-5 xl:ml-2'>
            <ExplorerEventDetail event={selectedEvent} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
