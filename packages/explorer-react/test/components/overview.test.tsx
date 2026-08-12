import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ExplorerOverview, ExplorerProvider } from '../../src/components/index.js';
import type { ExplorerSchemaDescriptor, ExplorerSnapshot } from '../../src/contracts/index.js';

const emptySchema: ExplorerSchemaDescriptor = {
  source: 'unknown',
  summary: 'unknown',
  fields: [],
};

const snapshot: ExplorerSnapshot = {
  metrics: [
    {
      label: 'Entities',
      value: 1,
    },
    {
      label: 'Operations',
      value: 1,
    },
  ],
  entities: [
    {
      name: 'Book',
      fieldCount: 2,
      relationCount: 1,
      graphOperationCount: 1,
      domainOperationCount: 0,
      durableOperationCount: 1,
      taskCount: 1,
      exposure: 'internal',
    },
  ],
  operations: [
    {
      id: 'Book.getSharingInfo',
      entityName: 'Book',
      name: 'getSharingInfo',
      kind: 'graph',
      authority: 'system',
      exposure: 'internal',
      inputSchema: emptySchema,
      resultSchema: emptySchema,
    },
  ],
  tasks: [
    {
      id: 'importBook',
      entityName: 'Book',
      name: 'importBook',
      inputSchema: emptySchema,
      progressSchema: emptySchema,
      resultSchema: emptySchema,
      steps: [],
    },
  ],
  events: [
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
      relatedEntities: ['Book'],
      handlers: ['notifyCollaborator'],
    },
  ],
  recentTaskRuns: [
    {
      taskId: 'importBook',
      runId: 'run-1',
      status: 'completed',
      updatedAt: '2026-07-18T00:00:00.000Z',
      trigger: {
        cause: 'user_request',
      },
    },
  ],
};

afterEach(cleanup);

describe('ExplorerOverview', () => {
  it('renders snapshot links using package-owned Explorer routes', () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerOverview snapshot={snapshot} />
      </ExplorerProvider>,
    );

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));

    expect(screen.getByRole('heading', { name: 'Ontahi Explorer' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Entities' })).toBeTruthy();
    expect(screen.getByText('1 durable')).toBeTruthy();
    expect(hrefs).toContain('/internal/graph/entities/Book');
    expect(hrefs).toContain('/internal/graph/operations/Book.getSharingInfo');
    expect(hrefs).toContain('/internal/graph/tasks/importBook');
    expect(hrefs).toContain('/internal/graph/tasks/importBook?tab=runs');
    expect(hrefs).toContain('/internal/graph/events/BookShared');
  });

  it('renders overview empty states', () => {
    render(
      <ExplorerOverview
        snapshot={{
          ...snapshot,
          tasks: [],
          recentTaskRuns: [],
        }}
      />,
    );

    expect(screen.getByText('No task definitions found.')).toBeTruthy();
    expect(screen.getByText('No recent task runs.')).toBeTruthy();
  });
});
