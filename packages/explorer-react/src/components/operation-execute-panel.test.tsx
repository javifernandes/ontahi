import type { ReflectedEntityDataReader, ReflectedOperationInvoker } from '@ontahi/core/data-graph';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExplorerOperationDescriptor } from '../contracts/index.js';

import { updateExplorerEntityRefInputDraft } from './operation-executor.js';

import {
  ExplorerOperationExecutePanel,
  ExplorerProvider,
  type ExplorerOperationRefInputRenderer,
} from './index.js';

type MockEditorProps = {
  value: string;
  language?: string;
  path?: string;
  theme?: string;
  options?: {
    readOnly?: boolean;
  };
  onChange?: (value?: string) => void;
};

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, language, path, theme, options, onChange }: MockEditorProps) => (
    <textarea
      aria-label={path ?? 'Explorer editor'}
      data-language={language}
      data-theme={theme}
      readOnly={options?.readOnly}
      value={value}
      onChange={event => onChange?.(event.target.value)}
    />
  ),
}));

const invokeOperationMock = vi.fn();
const readEntityDataMock = vi.fn();

const invocationSuccess = (result: unknown) => ({
  ok: true as const,
  kind: 'success' as const,
  value: result,
});

const buildOperation = (
  overrides: Partial<ExplorerOperationDescriptor> = {},
): ExplorerOperationDescriptor => ({
  id: 'Book.getSharingInfo',
  entityName: 'Book',
  name: 'getSharingInfo',
  kind: 'domain',
  authority: 'server',
  exposure: 'bridge',
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
  resultSchema: {
    source: 'not-declared',
    summary: 'unknown',
    fields: [],
  },
  ...overrides,
});

const createWrapper = ({
  reflectedEntityDataReader = {
    readEntityData: readEntityDataMock,
  },
  reflectedOperationInvoker = {
    invokeOperation: invokeOperationMock,
  },
}: {
  reflectedEntityDataReader?: ReflectedEntityDataReader;
  reflectedOperationInvoker?: ReflectedOperationInvoker;
} = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OntahiGraphProvider
          runtime={{ name: 'test-runtime' }}
          reflectedEntityDataReader={reflectedEntityDataReader}
          reflectedOperationInvoker={reflectedOperationInvoker}
        >
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
  };
};

const renderWithGraphRuntime = (
  ui: ReactNode,
  options?: {
    reflectedEntityDataReader?: ReflectedEntityDataReader;
    reflectedOperationInvoker?: ReflectedOperationInvoker;
  },
) => render(ui, { wrapper: createWrapper(options) });

beforeEach(() => {
  invokeOperationMock.mockReset();
  readEntityDataMock.mockReset();
  invokeOperationMock.mockResolvedValue(invocationSuccess(null));
  readEntityDataMock.mockResolvedValue({
    entityName: 'Book',
    columns: [],
    rows: [],
    page: 1,
    pageSize: 6,
    totalCount: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });
});

afterEach(cleanup);

describe('ExplorerOperationExecutePanel', () => {
  it('executes scalar inputs through the reflected operation invoker', async () => {
    const user = userEvent.setup();
    invokeOperationMock.mockResolvedValueOnce(
      invocationSuccess({
        title: 'Programming Book',
      }),
    );

    renderWithGraphRuntime(<ExplorerOperationExecutePanel operation={buildOperation()} />);

    fireEvent.change(screen.getByPlaceholderText('string'), {
      target: {
        value: 'progbook',
      },
    });
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith({
        operationId: 'Book.getSharingInfo',
        operation: {
          id: 'Book.getSharingInfo',
          entityName: 'Book',
          name: 'getSharingInfo',
          kind: 'domain',
          authority: 'server',
          exposure: 'bridge',
        },
        input: {
          bookSlug: 'progbook',
        },
      });
    });
    expect(
      (screen.getByLabelText('explorer://Book.getSharingInfo/result.json') as HTMLTextAreaElement)
        .value,
    ).toBe(
      JSON.stringify(
        {
          title: 'Programming Book',
        },
        null,
        2,
      ),
    );
  });

  it('follows a durable task run through progress to its final output', async () => {
    const user = userEvent.setup();
    const loadTaskRunSource = vi.fn().mockResolvedValue({
      taskId: 'book.import',
      runId: 'run-1',
      status: 'completed',
      updatedAt: '2026-07-19T12:00:00.000Z',
      completedAt: '2026-07-19T12:00:00.000Z',
      progress: {
        phase: 'completed',
        message: 'Imported progbook.',
        percent: 100,
      },
      input: {
        bookSlug: 'progbook',
      },
      trigger: {
        cause: 'user_request',
      },
      result: {
        bookSlug: 'progbook',
        chapters: 12,
      },
    });
    invokeOperationMock.mockResolvedValueOnce(
      invocationSuccess({
        taskId: 'book.import',
        runId: 'run-1',
        status: 'queued',
      }),
    );

    renderWithGraphRuntime(
      <ExplorerProvider basePath='/internal/graph' loadTaskRunSource={loadTaskRunSource}>
        <ExplorerOperationExecutePanel
          operation={buildOperation({
            id: 'Book.import',
            name: 'import',
            kind: 'durable',
            durable: {
              taskId: 'book.import',
              runtime: 'test-runtime',
              hasSubject: false,
              runRefSchema: buildOperation().resultSchema,
              progressSchema: buildOperation().resultSchema,
              finalOutputSchema: buildOperation().resultSchema,
            },
          })}
        />
      </ExplorerProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText('string'), {
      target: {
        value: 'progbook',
      },
    });
    await user.click(screen.getByRole('button', { name: /^start$/i }));

    expect(await screen.findByText('Task run started')).toBeTruthy();
    await waitFor(() => {
      expect(loadTaskRunSource).toHaveBeenCalledWith({
        taskId: 'book.import',
        runId: 'run-1',
      });
    });
    expect(await screen.findByText('Imported progbook.')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByRole('link', { name: /view task runs/i }).getAttribute('href')).toBe(
      '/internal/graph/tasks/book.import?tab=runs',
    );
    expect(
      (
        screen.getByLabelText(
          'explorer://Book.import/runs/run-1/final-output.json',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(
      JSON.stringify(
        {
          bookSlug: 'progbook',
          chapters: 12,
        },
        null,
        2,
      ),
    );
    expect(screen.queryByLabelText('explorer://Book.import/result.json')).toBeNull();
  });

  it('renders unavailable operations without execution controls', () => {
    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel operation={buildOperation({ kind: 'graph' })} />,
    );

    expect(screen.getByText('Execution is not available for this operation yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /run/i })).toBeNull();
  });

  it('keeps compact scalar inputs placeholder-like and executes destructive operations after confirmation', async () => {
    const user = userEvent.setup();
    invokeOperationMock.mockResolvedValueOnce(
      invocationSuccess({
        removed: true,
      }),
    );

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'Book.deleteBook',
          name: 'deleteBook',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'bookSlug',
                type: 'string',
                required: true,
              },
              {
                path: 'confirmation',
                type: 'string',
                required: true,
              },
            ],
          },
        })}
        variant='compact'
      />,
    );

    const runButton = screen.getByRole('button', { name: /^run$/i }) as HTMLButtonElement;

    expect(runButton.disabled).toBe(true);
    expect(screen.getByPlaceholderText('bookSlug').hasAttribute('required')).toBe(true);
    expect(screen.getByPlaceholderText('confirmation').hasAttribute('required')).toBe(true);
    expect(screen.getAllByText('text')).toHaveLength(2);
    expect(screen.getByText('bookSlug is required.')).toBeTruthy();
    expect(screen.getByText('confirmation is required.')).toBeTruthy();
    expect(screen.getByText('Complete the required operation inputs before running.')).toBeTruthy();

    await user.click(screen.getByRole('checkbox', { name: /i understand this operation/i }));
    expect(runButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('bookSlug'), {
      target: {
        value: 'progbook',
      },
    });
    fireEvent.change(screen.getByPlaceholderText('confirmation'), {
      target: {
        value: 'progbook',
      },
    });

    expect(runButton.disabled).toBe(false);
    expect(screen.queryByText('Complete the required operation inputs before running.')).toBeNull();
    await user.click(runButton);

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'Book.deleteBook',
          input: {
            bookSlug: 'progbook',
            confirmation: 'progbook',
          },
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByLabelText('explorer://Book.deleteBook/result.json')).toBeTruthy();
    });
    expect(
      (screen.getByLabelText('explorer://Book.deleteBook/result.json') as HTMLTextAreaElement)
        .value,
    ).toBe(
      JSON.stringify(
        {
          removed: true,
        },
        null,
        2,
      ),
    );
    expect(screen.queryByText('Runtime result')).toBeNull();
  });

  it('authors a reflected entity selection without exposing its transport object', async () => {
    const user = userEvent.setup();
    invokeOperationMock.mockResolvedValueOnce(invocationSuccess({ marked: true }));
    readEntityDataMock.mockResolvedValueOnce({
      entityName: 'UserNotification',
      columns: [
        { field: 'id', type: 'id', nullable: false },
        { field: 'title', type: 'string', nullable: false },
      ],
      display: { primary: 'title' },
      rows: [
        { id: 'notification-1', title: 'First notification' },
        { id: 'notification-2', title: 'Second notification' },
      ],
      page: 1,
      pageSize: 8,
      totalCount: 2,
      hasPreviousPage: false,
      hasNextPage: false,
    });

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'UserNotification.markNotificationsRead',
          entityName: 'UserNotification',
          name: 'markNotificationsRead',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'notifications',
                type: 'Selection<UserNotification>',
                required: true,
                selection: {
                  entityName: 'UserNotification',
                  cardinality: 'many',
                  identity: { name: 'refById', fields: ['id'] },
                },
              },
            ],
          },
        })}
        variant='compact'
      />,
    );

    expect(screen.getByText('UserNotification selection (many)')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Selected (0)' }).getAttribute('aria-checked')).toBe(
      'false',
    );

    await user.click(screen.getByRole('textbox', { name: 'Choose UserNotification' }));
    await user.click(await screen.findByRole('checkbox', { name: /First notification/ }));
    await user.click(screen.getByRole('checkbox', { name: /Second notification/ }));
    expect(screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: 'Selected (2)' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'UserNotification.markNotificationsRead',
          input: {
            notifications: {
              kind: 'selection',
              entityName: 'UserNotification',
              expression: {
                kind: 'references',
                refs: [
                  {
                    kind: 'entity-ref',
                    entityName: 'UserNotification',
                    locator: { id: 'notification-1' },
                  },
                  {
                    kind: 'entity-ref',
                    entityName: 'UserNotification',
                    locator: { id: 'notification-2' },
                  },
                ],
              },
            },
          },
        }),
      );
    });
  });

  it('renders selection loading feedback inside the open dropdown', async () => {
    const user = userEvent.setup();
    readEntityDataMock.mockImplementationOnce(
      () =>
        new Promise<never>(() => {
          // Keep the reflected read pending while asserting the loading placement.
        }),
    );

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          inputRefs: [],
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'progress',
                type: 'Selection<ReadingProgress>',
                required: true,
                selection: {
                  entityName: 'ReadingProgress',
                  cardinality: 'one',
                  identity: {
                    name: 'refByUserAndBook',
                    fields: ['userId', 'bookId'],
                  },
                },
              },
            ],
          },
        })}
        variant='compact'
      />,
    );

    await user.click(screen.getByRole('textbox', { name: 'Choose ReadingProgress' }));

    const loading = await screen.findByRole('status');
    expect(loading.textContent).toContain('Loading ReadingProgress…');
    expect(loading.parentElement?.className).toContain('max-h-64');
  });

  it('uses single-choice semantics for one-cardinality selections', async () => {
    const user = userEvent.setup();
    readEntityDataMock.mockResolvedValueOnce({
      entityName: 'ReadingProgress',
      columns: [
        { field: 'userId', type: 'id', nullable: false },
        { field: 'bookId', type: 'id', nullable: false },
      ],
      display: {
        primary: 'book.title',
        secondary: ['reader.displayName', 'reader.email'],
      },
      rows: [
        {
          userId: 'user-1',
          bookId: 'book-1',
          'book.title': 'Programming Book',
          'reader.displayName': 'Javi',
          'reader.email': 'javi@example.com',
        },
      ],
      page: 1,
      pageSize: 8,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          inputRefs: [],
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'progress',
                type: 'Selection<ReadingProgress>',
                required: true,
                selection: {
                  entityName: 'ReadingProgress',
                  cardinality: 'one',
                  identity: {
                    name: 'refByUserAndBook',
                    fields: ['userId', 'bookId'],
                  },
                },
              },
            ],
          },
        })}
        variant='compact'
      />,
    );

    expect(screen.queryByRole('radio', { name: 'All' })).toBeNull();
    await user.click(screen.getByRole('textbox', { name: 'Choose ReadingProgress' }));
    const option = await screen.findByRole('radio', { name: /Programming Book/ });
    expect(within(option).getByText(/Javi/)).toBeTruthy();
    expect(within(option).getByText(/javi@example.com/)).toBeTruthy();
    expect(within(option).getByText(/user-1.*book-1/)).toBeTruthy();
    await user.click(option);
    expect(screen.getByRole('radio', { name: 'Selected (1)' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            progress: {
              kind: 'selection',
              entityName: 'ReadingProgress',
              expression: {
                kind: 'references',
                refs: [
                  {
                    kind: 'entity-ref',
                    entityName: 'ReadingProgress',
                    locator: { userId: 'user-1', bookId: 'book-1' },
                  },
                ],
              },
            },
          },
        }),
      );
    });
  });

  it('renders reflected validation errors', async () => {
    const user = userEvent.setup();
    invokeOperationMock.mockResolvedValueOnce({
      ok: false,
      kind: 'input_invalid',
      executed: false,
      message: 'Invalid input.',
      issues: [{ path: 'bookSlug', message: 'Required', code: 'invalid_type' }],
    });

    renderWithGraphRuntime(<ExplorerOperationExecutePanel operation={buildOperation()} />);

    fireEvent.change(screen.getByPlaceholderText('string'), {
      target: {
        value: 'progbook',
      },
    });
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    expect(await screen.findByText('Invalid input')).toBeTruthy();
    expect(screen.getByText('Not executed')).toBeTruthy();
    expect(screen.getByText('Invalid input.')).toBeTruthy();
    const issues = screen.getByRole('list', { name: 'Input validation issues' });

    expect(within(issues).getByText('bookSlug')).toBeTruthy();
    expect(within(issues).getByText('invalid_type')).toBeTruthy();
    expect(within(issues).getByText('Required')).toBeTruthy();
    expect(
      (
        screen.getByLabelText(
          'explorer://Book.getSharingInfo/operation-result.json',
        ) as HTMLTextAreaElement
      ).value,
    ).toContain('"kind": "input_invalid"');
  });

  it.each([
    [
      'rejected',
      {
        ok: false as const,
        kind: 'rejected' as const,
        executed: false as const,
        reason: 'forbidden',
        message: 'You cannot execute this operation.',
      },
      'Operation rejected',
      'Not executed',
    ],
    [
      'failed',
      {
        ok: false as const,
        kind: 'failed' as const,
        executed: true as const,
        failure: { reason: 'not_found' },
        message: 'The book was not found.',
      },
      'Operation failed',
      'Executed',
    ],
    [
      'errored',
      {
        ok: false as const,
        kind: 'errored' as const,
        executed: 'unknown' as const,
        message: 'Operation execution is unavailable.',
      },
      'Runtime error',
      'Execution uncertain',
    ],
  ])(
    'renders canonical %s invocation errors',
    async (_kind, invocation, expectedTitle, expectedExecution) => {
      const user = userEvent.setup();
      invokeOperationMock.mockResolvedValueOnce(invocation);

      renderWithGraphRuntime(<ExplorerOperationExecutePanel operation={buildOperation()} />);

      fireEvent.change(screen.getByPlaceholderText('string'), {
        target: {
          value: 'progbook',
        },
      });
      await user.click(screen.getByRole('button', { name: /^run$/i }));

      expect(await screen.findByText(expectedTitle)).toBeTruthy();
      expect(screen.getByText(expectedExecution)).toBeTruthy();
      expect(screen.getByText(invocation.message)).toBeTruthy();
      expect(
        screen.getByLabelText('explorer://Book.getSharingInfo/operation-result.json'),
      ).toBeTruthy();
    },
  );

  it('renders enum scalar inputs as selectors', async () => {
    const user = userEvent.setup();
    invokeOperationMock.mockResolvedValueOnce(invocationSuccess(null));

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'CommentThread.listThreadsForBook',
          entityName: 'CommentThread',
          name: 'listThreadsForBook',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'sort',
                type: '"book_order" | "recent_activity" | "newest"',
                required: false,
                enumValues: ['book_order', 'recent_activity', 'newest'],
              },
            ],
          },
        })}
      />,
    );

    await user.click(screen.getByLabelText('sort'));
    await user.click(screen.getByRole('option', { name: 'newest' }));
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'CommentThread.listThreadsForBook',
          input: {
            sort: 'newest',
          },
        }),
      );
    });
  });

  it('renders integer scalar inputs as numeric controls', async () => {
    const user = userEvent.setup();
    invokeOperationMock.mockResolvedValueOnce(invocationSuccess(null));

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'CommentThread.listThreadsForBook',
          entityName: 'CommentThread',
          name: 'listThreadsForBook',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'limit',
                type: 'integer',
                required: false,
              },
            ],
          },
        })}
      />,
    );

    const limitInput = screen.getByRole('spinbutton') as HTMLInputElement;

    expect(limitInput.getAttribute('inputmode')).toBe('numeric');
    expect(limitInput.getAttribute('step')).toBe('1');

    fireEvent.change(limitInput, {
      target: {
        value: '25',
      },
    });
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'CommentThread.listThreadsForBook',
          input: {
            limit: 25,
          },
        }),
      );
    });
  });

  it('renders boolean scalar inputs as radio choices', async () => {
    const user = userEvent.setup();
    invokeOperationMock.mockResolvedValueOnce(invocationSuccess(null));

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'Book.setCollaboratorPending',
          entityName: 'Book',
          name: 'setCollaboratorPending',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'isPending',
                type: 'boolean',
                required: false,
                presentation: {
                  booleanLabels: {
                    true: 'Pending invite',
                    false: 'Active collaborator',
                    unset: 'Default',
                  },
                },
              },
            ],
          },
        })}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Default' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Pending invite' }).getAttribute('aria-checked')).toBe(
      'false',
    );

    await user.click(screen.getByRole('radio', { name: 'Pending invite' }));
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'Book.setCollaboratorPending',
          input: {
            isPending: true,
          },
        }),
      );
    });
  });

  it('keeps compact boolean inputs labelled beside their choices', () => {
    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'Book.removeCollaborator',
          entityName: 'Book',
          name: 'removeCollaborator',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'isPending',
                type: 'boolean',
                required: false,
                presentation: {
                  booleanLabels: {
                    true: 'Pending invite',
                    false: 'Active collaborator',
                    unset: 'Default',
                  },
                },
              },
            ],
          },
        })}
        variant='compact'
      />,
    );

    expect(screen.getByText('isPending')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Default' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Pending invite' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Active collaborator' })).toBeTruthy();
  });

  it('uses the package-owned entity ref input by default', async () => {
    const user = userEvent.setup();
    readEntityDataMock.mockResolvedValueOnce({
      entityName: 'Book',
      columns: [],
      rows: [
        {
          id: 'book-1',
          title: 'Programming Book',
          slug: 'progbook',
        },
      ],
      page: 1,
      pageSize: 6,
      totalCount: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'BookCollaborators.invite',
          entityName: 'BookCollaborators',
          name: 'invite',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'bookSlug',
                type: 'string',
                required: true,
              },
              {
                path: 'email',
                type: 'string',
                required: true,
              },
            ],
          },
          inputRefs: [
            {
              path: 'book',
              entityName: 'Book',
              receiver: true,
              optional: false,
              locators: [
                {
                  name: 'refBySlug',
                  fields: ['bookSlug'],
                  sourceFields: ['slug'],
                },
              ],
            },
          ],
        })}
        variant='compact'
      />,
    );

    await user.click(screen.getByPlaceholderText('book'));
    await waitFor(() => {
      expect(readEntityDataMock).toHaveBeenCalledWith({
        entityName: 'Book',
        search: '',
        pageSize: 6,
      });
    });

    const option = (await screen.findByText('Programming Book')).closest('button');

    expect(option).not.toBeNull();
    expect(within(option as HTMLButtonElement).getByText('progbook')).toBeTruthy();
    await user.click(option as HTMLButtonElement);

    fireEvent.change(screen.getByPlaceholderText('email'), {
      target: {
        value: 'reader@example.com',
      },
    });
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'BookCollaborators.invite',
          input: {
            book: {
              kind: 'entity-ref',
              entityName: 'Book',
              locator: {
                slug: 'progbook',
              },
            },
            email: 'reader@example.com',
          },
        }),
      );
    });
  });

  it('cancels a pending entity ref close when the input unmounts', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    try {
      const view = renderWithGraphRuntime(
        <ExplorerOperationExecutePanel
          operation={buildOperation({
            inputRefs: [
              {
                path: 'book',
                entityName: 'Book',
                receiver: true,
                optional: false,
                locators: [
                  {
                    name: 'refBySlug',
                    fields: ['bookSlug'],
                    sourceFields: ['slug'],
                  },
                ],
              },
            ],
          })}
        />,
      );
      const input = screen.getByLabelText('book Book');

      fireEvent.focus(input);
      fireEvent.blur(input);

      const closeCallIndex = setTimeoutSpy.mock.calls.findIndex(([, delay]) => delay === 150);
      const closeTimer = setTimeoutSpy.mock.results[closeCallIndex]?.value;

      expect(closeCallIndex).toBeGreaterThanOrEqual(0);
      view.unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(closeTimer);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  it('allows a host to replace one reflected ref input', async () => {
    const user = userEvent.setup();
    const renderRefInput: ExplorerOperationRefInputRenderer = ({
      input,
      inputRef,
      locator,
      onChange,
    }) => (
      <button
        type='button'
        onClick={() =>
          onChange(
            updateExplorerEntityRefInputDraft({
              input,
              inputRef,
              locatorName: locator.name,
              sourceField: 'bookSlug',
              value: 'progbook',
              locatorValues: {
                bookSlug: 'progbook',
                partSlug: 'part-one',
                chapterSlug: 'chapter-one',
              },
            }),
          )
        }
      >
        Select chapter path
      </button>
    );

    renderWithGraphRuntime(
      <ExplorerOperationExecutePanel
        operation={buildOperation({
          id: 'Book.fetchChapter',
          entityName: 'Book',
          name: 'fetchChapter',
          inputSchema: {
            source: 'ontahi',
            summary: 'object',
            fields: [
              {
                path: 'bookSlug',
                type: 'string',
                required: true,
              },
              {
                path: 'partSlug',
                type: 'string | null',
                required: true,
              },
              {
                path: 'chapterSlug',
                type: 'string',
                required: true,
              },
            ],
          },
          inputRefs: [
            {
              path: 'chapter',
              entityName: 'ContentNode',
              receiver: false,
              optional: false,
              locators: [
                {
                  name: 'refByBookChapterPath',
                  fields: ['bookSlug', 'partSlug', 'chapterSlug'],
                  sourceFields: ['bookSlug', 'partSlug', 'chapterSlug'],
                },
              ],
            },
          ],
        })}
        renderRefInput={renderRefInput}
        variant='compact'
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Select chapter path' }));
    await user.click(screen.getByRole('button', { name: /^run$/i }));

    await waitFor(() => {
      expect(invokeOperationMock).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'Book.fetchChapter',
          input: {
            chapter: {
              kind: 'entity-ref',
              entityName: 'ContentNode',
              locator: {
                bookSlug: 'progbook',
                partSlug: 'part-one',
                chapterSlug: 'chapter-one',
              },
            },
          },
        }),
      );
    });
  });
});
