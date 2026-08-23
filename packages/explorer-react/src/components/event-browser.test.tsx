import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExplorerEventDescriptor } from '../contracts/index.js';

import { ExplorerEventBrowser, ExplorerProvider } from './index.js';

const events: ExplorerEventDescriptor[] = [
  {
    type: 'BookShared',
    domain: 'sharing',
    actorScoped: true,
    payloadFields: [
      {
        name: 'bookSlug',
        type: 'string',
      },
    ],
    relatedEntities: ['Book', 'Profile'],
    handlers: ['notifyCollaborator'],
  },
  {
    type: 'ReadProgressed',
    domain: 'reading',
    actorScoped: false,
    payloadFields: [
      {
        name: 'chapterSlug',
        type: 'string',
      },
    ],
    relatedEntities: ['Book'],
    handlers: ['refreshTimeline'],
  },
];

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
});

afterEach(cleanup);

describe('ExplorerEventBrowser', () => {
  it('renders the selected event and package-owned Explorer links', () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEventBrowser events={events} selectedEventType='ReadProgressed' />
      </ExplorerProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Event Catalog' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ReadProgressed' })).toBeTruthy();
    expect(screen.getByText('refreshTimeline')).toBeTruthy();
    expect(screen.getByRole('link', { name: /BookShared/ }).getAttribute('href')).toBe(
      '/internal/graph/events/BookShared',
    );
    expect(screen.getByRole('link', { name: 'Book' }).getAttribute('href')).toBe(
      '/internal/graph/entities/Book',
    );
  });

  it('selects events locally while preserving route-shaped URLs', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEventBrowser events={events} selectedEventType='BookShared' />
      </ExplorerProvider>,
    );

    await user.click(screen.getByRole('link', { name: /ReadProgressed/ }));

    expect(screen.getByText('refreshTimeline')).toBeTruthy();
    expect(globalThis.location.pathname).toBe('/internal/graph/events/ReadProgressed');
  });

  it('filters events by domain and search text', async () => {
    const user = userEvent.setup();

    render(<ExplorerEventBrowser events={events} />);

    await user.click(screen.getByLabelText('Filter events by domain'));
    await user.click(screen.getByRole('option', { name: 'reading' }));

    expect(screen.queryByRole('link', { name: /BookShared/ })).toBeNull();
    expect(screen.getByRole('link', { name: /ReadProgressed/ })).toBeTruthy();

    await user.type(screen.getByLabelText('Search events'), 'missing event');

    expect(screen.getByText('No events match.')).toBeTruthy();
  });
});
