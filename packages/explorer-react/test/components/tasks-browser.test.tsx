import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExplorerProvider, ExplorerTasksBrowser } from '../../src/components/index.js';
import type {
  ExplorerSchemaDescriptor,
  ExplorerTaskDescriptor,
  ExplorerTaskRunListItem,
  ExplorerTaskRunSource,
} from '../../src/contracts/index.js';

type MockEditorProps = {
  value: string;
  path?: string;
  onChange?: (value?: string) => void;
};

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, path, onChange }: MockEditorProps) => (
    <textarea
      aria-label={path ?? 'Explorer editor'}
      readOnly={!onChange}
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

const tasks: ExplorerTaskDescriptor[] = [
  {
    id: 'book.import',
    entityName: 'Book',
    name: 'importBook',
    inputSchema: {
      source: 'zod',
      summary: 'object',
      fields: [
        {
          path: 'sourceUrl',
          type: 'string',
          required: true,
        },
      ],
    },
    progressSchema: emptySchema,
    resultSchema: emptySchema,
    steps: [
      {
        id: 'extract',
        inputSchema: emptySchema,
        resultSchema: emptySchema,
      },
    ],
  },
  {
    id: 'book.export',
    entityName: 'Book',
    name: 'exportBook',
    inputSchema: emptySchema,
    progressSchema: emptySchema,
    resultSchema: emptySchema,
    steps: [],
  },
];

const run: ExplorerTaskRunListItem = {
  taskId: 'book.import',
  runId: 'run-1',
  status: 'completed',
  createdAt: '2026-07-18T15:00:00.000Z',
  startedAt: '2026-07-18T15:00:01.000Z',
  updatedAt: '2026-07-18T15:00:05.000Z',
  completedAt: '2026-07-18T15:00:05.000Z',
  progress: {
    message: 'Imported book',
    percent: 100,
  },
  trigger: {
    cause: 'user_request',
    actor: {
      kind: 'user',
      id: 'user-1',
    },
    ingress: {
      kind: 'server_action',
    },
  },
  runtime: {
    name: 'workflow',
    runId: 'workflow-1',
  },
};

const refreshedRun: ExplorerTaskRunListItem = {
  ...run,
  runId: 'run-2',
  progress: {
    message: 'Refreshed import',
    percent: 75,
  },
};

const source: ExplorerTaskRunSource = {
  ...run,
  input: {
    sourceUrl: 'file:///books/book.md',
  },
  result: {
    slug: 'book',
  },
};

beforeEach(() => {
  globalThis.history.replaceState(null, '', '/');
});

afterEach(cleanup);

describe('ExplorerTasksBrowser', () => {
  it('renders task links, entity links, and task structure with Explorer routes', () => {
    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerTasksBrowser tasks={tasks} recentTaskRuns={[run]} selectedTaskId='book.import' />
      </ExplorerProvider>,
    );

    const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));

    expect(screen.getByRole('heading', { name: 'Task Catalog' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Import Book' })).toBeTruthy();
    expect(screen.getByText('sourceUrl')).toBeTruthy();
    expect(hrefs).toContain('/internal/graph/entities/Book');
    expect(hrefs).toContain('/internal/graph/tasks/book.import');
    expect(hrefs).toContain('/internal/graph/tasks/book.export');
  });

  it('uses local task and tab navigation while preserving route-shaped URLs', async () => {
    const user = userEvent.setup();

    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerTasksBrowser tasks={tasks} recentTaskRuns={[run]} selectedTaskId='book.import' />
      </ExplorerProvider>,
    );

    await user.click(screen.getByRole('link', { name: /Export Book/ }));

    expect(screen.getByRole('heading', { name: 'Export Book' })).toBeTruthy();
    expect(globalThis.location.pathname).toBe('/internal/graph/tasks/book.export');

    await user.click(screen.getByRole('button', { name: 'Recent runs (0)' }));

    expect(globalThis.location.search).toBe('?tab=runs');
    expect(screen.getByText('No recent runs for this task.')).toBeTruthy();
  });

  it('loads task run source and refreshes runs through host loaders', async () => {
    const user = userEvent.setup();
    const loadTaskRunSource = vi.fn().mockResolvedValue(source);
    const loadRecentTaskRuns = vi.fn().mockResolvedValue([refreshedRun]);

    render(
      <ExplorerProvider basePath='/internal/graph'>
        <ExplorerTasksBrowser
          tasks={tasks}
          recentTaskRuns={[run]}
          selectedTaskId='book.import'
          selectedTab='runs'
          loadRecentTaskRuns={loadRecentTaskRuns}
          loadTaskRunSource={loadTaskRunSource}
        />
      </ExplorerProvider>,
    );

    await user.click(screen.getByText('Imported book'));

    await waitFor(() => {
      expect(loadTaskRunSource).toHaveBeenCalledWith({
        taskId: 'book.import',
        runId: 'run-1',
      });
    });
    const inputEditor = await screen.findByLabelText('explorer://task-runs/run-1/input.json');
    const returnEditor = screen.getByLabelText('explorer://task-runs/run-1/return-value.json');

    expect((inputEditor as HTMLTextAreaElement).value).toBe(JSON.stringify(source.input, null, 2));
    expect((returnEditor as HTMLTextAreaElement).value).toBe(
      JSON.stringify(source.result, null, 2),
    );

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(loadRecentTaskRuns).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Refreshed import')).toBeTruthy();
  });

  it('filters tasks by search text', async () => {
    const user = userEvent.setup();

    render(<ExplorerTasksBrowser tasks={tasks} recentTaskRuns={[]} />);

    await user.type(screen.getByLabelText('Search tasks'), 'export');

    expect(screen.queryByRole('link', { name: /Import Book/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Export Book/ })).toBeTruthy();
  });
});
