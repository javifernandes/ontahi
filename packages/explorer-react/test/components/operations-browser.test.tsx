import { OntahiGraphProvider } from '@ontahi/react/graph';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplorerOperationsBrowser, ExplorerProvider } from '../../src/components/index.js';
import type {
  ExplorerOperationDescriptor,
  ExplorerSchemaDescriptor,
} from '../../src/contracts/index.js';

type MockEditorProps = {
  value: string;
  language?: string;
  path?: string;
  options?: {
    readOnly?: boolean;
  };
  onChange?: (value?: string) => void;
};

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, language, path, options, onChange }: MockEditorProps) => (
    <textarea
      aria-label={path ?? 'Explorer editor'}
      data-language={language}
      readOnly={options?.readOnly}
      value={value}
      onChange={event => onChange?.(event.target.value)}
    />
  ),
}));

const emptySchema: ExplorerSchemaDescriptor = {
  source: 'unknown',
  summary: 'unknown',
  fields: [],
};

const operations: ExplorerOperationDescriptor[] = [
  {
    id: 'Book.getSharingInfo',
    entityName: 'Book',
    name: 'getSharingInfo',
    kind: 'graph',
    authority: 'server',
    exposure: 'internal',
    hasBridgeQuery: true,
    bridgeQueryCount: 2,
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
  },
  {
    id: 'Book.importBook',
    entityName: 'Book',
    name: 'importBook',
    kind: 'durable',
    authority: 'system',
    exposure: 'internal',
    ingressRoutes: [
      {
        kind: 'http',
        method: 'POST',
        route: '/api/books/import',
      },
    ],
    inputSchema: emptySchema,
    resultSchema: emptySchema,
  },
];

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
});

afterEach(cleanup);

const renderWithOperationRuntime = (ui: ReactNode) =>
  render(
    <OntahiGraphProvider
      runtime={{ name: 'test-runtime' }}
      reflectedOperationInvoker={{
        invokeOperation: vi.fn().mockResolvedValue({
          ok: true,
          kind: 'success',
          value: null,
        }),
      }}
    >
      {ui}
    </OntahiGraphProvider>,
  );

describe('ExplorerOperationsBrowser', () => {
  it('renders operation links and descriptor metadata with Explorer routes', () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerOperationsBrowser
          operations={operations}
          selectedOperationId='Book.getSharingInfo'
          selectedTab='metadata'
          renderExecutePanel={({ operation }) => (
            <div data-testid='execute-panel'>execute {operation.id}</div>
          )}
        />
      </ExplorerProvider>,
    );

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));

    expect(screen.getByRole('heading', { name: 'Operation Catalog' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Get Sharing Info' })).toBeTruthy();
    expect(screen.getByText('Bridge Query')).toBeTruthy();
    expect(hrefs).toContain('/internal/graph/entities/Book');
    expect(hrefs).toContain('/internal/graph/operations/Book.getSharingInfo');
    expect(hrefs).toContain('/internal/graph/operations/Book.importBook');
  });

  it('uses local operation and tab navigation while preserving route-shaped URLs', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerOperationsBrowser
          operations={operations}
          selectedOperationId='Book.getSharingInfo'
          renderExecutePanel={({ operation }) => (
            <div data-testid='execute-panel'>execute {operation.id}</div>
          )}
        />
      </ExplorerProvider>,
    );

    await user.click(screen.getByRole('link', { name: /Import Book/ }));

    expect(screen.getByTestId('execute-panel').textContent).toBe('execute Book.importBook');
    expect(globalThis.location.pathname).toBe('/internal/graph/operations/Book.importBook');

    await user.click(screen.getByRole('button', { name: 'Ingress' }));

    expect(screen.getByText('/api/books/import')).toBeTruthy();
    expect(globalThis.location.search).toBe('?tab=ingress');
  });

  it('hides execution when no host execute panel is supplied', () => {
    render(
      <ExplorerOperationsBrowser operations={operations} selectedOperationId='Book.importBook' />,
    );

    expect(screen.queryByRole('button', { name: 'Execute' })).toBeNull();
    expect(screen.getByText('Input')).toBeTruthy();
  });

  it('uses the package-owned execute panel when a reflected operation invoker is registered', () => {
    renderWithOperationRuntime(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerOperationsBrowser
          operations={[
            {
              ...operations[0]!,
              kind: 'domain',
              exposure: 'bridge',
            },
          ]}
          selectedOperationId='Book.getSharingInfo'
        />
      </ExplorerProvider>,
    );

    expect(screen.getByRole('button', { name: 'Execute' })).toBeTruthy();
    expect(screen.getByPlaceholderText('bookSlug')).toBeTruthy();
  });

  it('filters operations by kind and search text', async () => {
    const user = userEvent.setup();

    render(<ExplorerOperationsBrowser operations={operations} />);

    await user.click(screen.getByLabelText('Filter operations by kind'));
    await user.click(screen.getByRole('option', { name: 'durable' }));

    expect(screen.queryByRole('link', { name: /Get Sharing Info/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Import Book/ })).toBeTruthy();

    await user.type(screen.getByLabelText('Search operations'), 'missing operation');

    expect(screen.getByText('No operations match.')).toBeTruthy();
  });
});
