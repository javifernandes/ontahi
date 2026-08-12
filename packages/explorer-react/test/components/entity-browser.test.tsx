import type { ReflectedEntityDataReader } from '@ontahi/core/data-graph';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplorerEntityBrowser, ExplorerProvider } from '../../src/components/index.js';
import type {
  ExplorerEntityDetail,
  ExplorerOperationDescriptor,
  ExplorerSchemaDescriptor,
  ExplorerTaskDescriptor,
} from '../../src/contracts/index.js';

const emptySchema: ExplorerSchemaDescriptor = {
  source: 'unknown',
  summary: 'unknown',
  fields: [],
};

const entities: ExplorerEntityDetail[] = [
  {
    name: 'Book',
    fieldCount: 2,
    relationCount: 1,
    graphOperationCount: 1,
    domainOperationCount: 0,
    durableOperationCount: 0,
    taskCount: 1,
    exposure: 'public',
    diagram: 'graph TD; Book-->Profile;',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        nullable: false,
      },
      {
        name: 'title',
        type: 'text',
        nullable: true,
      },
    ],
    relations: [
      {
        name: 'owner',
        kind: 'belongsTo',
        target: 'Profile',
      },
    ],
  },
  {
    name: 'Profile',
    fieldCount: 1,
    relationCount: 0,
    graphOperationCount: 0,
    domainOperationCount: 0,
    durableOperationCount: 0,
    taskCount: 0,
    diagram: 'graph TD; Profile;',
    fields: [
      {
        name: 'id',
        type: 'uuid',
        nullable: false,
      },
    ],
    relations: [],
  },
];

const relationEntity: ExplorerEntityDetail = {
  ...entities[1]!,
  name: 'BookToProfile',
  relationOwner: {
    source: 'Book',
    name: 'owner',
    cardinality: 'one',
    target: 'Profile',
  },
};

const operation: ExplorerOperationDescriptor = {
  id: 'Book.getSharingInfo',
  entityName: 'Book',
  name: 'getSharingInfo',
  kind: 'graph',
  authority: 'server',
  exposure: 'internal',
  description: 'Return sharing data.',
  inputSchema: {
    source: 'ontahi',
    summary: 'object',
    fields: [
      {
        path: 'bookSlug',
        type: 'string',
        required: true,
      },
    ],
  },
  resultSchema: emptySchema,
};

const task: ExplorerTaskDescriptor = {
  id: 'book.import',
  entityName: 'Book',
  name: 'importBook',
  inputSchema: emptySchema,
  progressSchema: emptySchema,
  resultSchema: emptySchema,
  steps: [
    {
      id: 'extract',
      inputSchema: emptySchema,
      resultSchema: emptySchema,
    },
  ],
};

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
});

afterEach(cleanup);

const withReflectedEntityDataReader = ({
  children,
  readEntityData = vi.fn().mockResolvedValue({
    entityName: 'Book',
    columns: [
      {
        field: 'title',
        type: 'string',
        nullable: false,
      },
    ],
    rows: [
      {
        title: 'Ontahi',
      },
    ],
    page: 1,
    pageSize: 25,
    totalCount: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  }),
}: {
  children: ReactNode;
  readEntityData?: ReflectedEntityDataReader['readEntityData'];
}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <OntahiGraphProvider
        runtime={{ name: 'test-runtime' }}
        reflectedEntityDataReader={{ readEntityData }}
      >
        {children}
      </OntahiGraphProvider>
    </QueryClientProvider>
  );
};

describe('ExplorerEntityBrowser', () => {
  it('renders entity detail with package-owned routes and host panels', () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEntityBrowser
          entities={entities}
          operations={[operation]}
          tasks={[task]}
          selectedEntityName='Book'
          selectedTab='operations'
          renderDataPanel={({ entity }) => <div data-testid='data-panel'>data {entity.name}</div>}
          renderDiagram={diagram => <pre data-testid='diagram'>{diagram}</pre>}
          renderExecutePanel={({ operation: selectedOperation }) => (
            <div data-testid='execute-panel'>execute {selectedOperation.id}</div>
          )}
        />
      </ExplorerProvider>,
    );

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));

    expect(screen.getByRole('heading', { name: 'Entity Browser' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Book' })).toBeTruthy();
    expect(screen.getByText('Get Sharing Info')).toBeTruthy();
    expect(screen.getByText('Import Book')).toBeTruthy();
    expect(screen.getByTestId('execute-panel').textContent).toBe('execute Book.getSharingInfo');
    expect(hrefs).toContain('/internal/graph/entities/Book');
    expect(hrefs).toContain('/internal/graph/entities/Profile');
  });

  it('uses local entity and tab navigation while preserving route-shaped URLs', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerEntityBrowser
          entities={entities}
          operations={[operation]}
          tasks={[task]}
          selectedEntityName='Book'
          renderDataPanel={({ entity }) => <div data-testid='data-panel'>data {entity.name}</div>}
        />
      </ExplorerProvider>,
    );

    await user.click(screen.getAllByRole('link', { name: /Profile/ })[0]!);

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeTruthy();
    expect(globalThis.location.pathname).toBe('/internal/graph/entities/Profile');

    await user.click(screen.getByRole('button', { name: 'Data' }));

    expect(screen.getByTestId('data-panel').textContent).toBe('data Profile');
    expect(globalThis.location.search).toBe('?tab=data');
  });

  it('hides data when no host data panel is supplied or the entity is a relation owner', () => {
    const { rerender } = render(
      <ExplorerEntityBrowser
        entities={entities}
        operations={[]}
        tasks={[]}
        selectedEntityName='Book'
        selectedTab='data'
      />,
    );

    expect(screen.queryByRole('button', { name: 'Data' })).toBeNull();
    expect(screen.getByText('Fields')).toBeTruthy();

    rerender(
      <ExplorerEntityBrowser
        entities={[relationEntity]}
        operations={[]}
        tasks={[]}
        selectedEntityName='BookToProfile'
        selectedTab='data'
        renderDataPanel={({ entity }) => <div>data {entity.name}</div>}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Data' })).toBeNull();
    expect(screen.getByText('Relation Owner')).toBeTruthy();
  });

  it('renders the default data panel when a reflected entity data reader is registered', async () => {
    const user = userEvent.setup();
    const readEntityData = vi.fn().mockResolvedValue({
      entityName: 'Book',
      columns: [
        {
          field: 'title',
          type: 'string',
          nullable: false,
        },
      ],
      rows: [
        {
          title: 'Ontahi',
        },
      ],
      page: 1,
      pageSize: 25,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });

    render(
      withReflectedEntityDataReader({
        readEntityData,
        children: (
          <ExplorerEntityBrowser
            entities={entities}
            operations={[]}
            tasks={[]}
            selectedEntityName='Book'
          />
        ),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Data' }));

    expect(await screen.findByText('Ontahi')).toBeTruthy();
    expect(readEntityData).toHaveBeenCalledWith(
      expect.objectContaining({
        entityName: 'Book',
        page: 1,
        pageSize: 25,
      }),
    );
  });

  it('filters entities by search text', async () => {
    const user = userEvent.setup();

    render(<ExplorerEntityBrowser entities={entities} operations={[]} tasks={[]} />);

    await user.type(screen.getByLabelText('Search entities'), 'Profile');

    expect(screen.queryByRole('link', { name: /Book/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Profile/ }).length).toBeGreaterThan(0);
  });
});
