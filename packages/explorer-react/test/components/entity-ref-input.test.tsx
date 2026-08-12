import type { ReflectedEntityDataReader } from '@ontahi/core/data-graph';
import { OntahiGraphProvider } from '@ontahi/react/graph';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplorerEntityRefInput } from '../../src/components/index.js';
import type { ExplorerOperationInputRefDescriptor } from '../../src/contracts/index.js';

const inputRef: ExplorerOperationInputRefDescriptor = {
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
};

const createWrapper = (reader: ReflectedEntityDataReader) => {
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
        <OntahiGraphProvider runtime={{ name: 'test-runtime' }} reflectedEntityDataReader={reader}>
          {children}
        </OntahiGraphProvider>
      </QueryClientProvider>
    );
  };
};

const renderControlledInput = ({
  onChange = vi.fn(),
  reader,
}: {
  onChange?: (nextInput: unknown) => void;
  reader: ReflectedEntityDataReader;
}) => {
  function Harness() {
    const [input, setInput] = useState<unknown>({
      book: {
        kind: 'entity-ref',
        entityName: 'Book',
        locator: {
          slug: '',
        },
      },
    });

    return (
      <ExplorerEntityRefInput
        input={input}
        inputRef={inputRef}
        locator={inputRef.locators[0]!}
        onChange={nextInput => {
          setInput(nextInput);
          onChange(nextInput);
        }}
        variant='compact'
      />
    );
  }

  return render(<Harness />, {
    wrapper: createWrapper(reader),
  });
};

afterEach(() => {
  cleanup();
});

describe('ExplorerEntityRefInput', () => {
  it('renders the loading state inside the open options panel', async () => {
    const user = userEvent.setup();
    const reader = {
      readEntityData: vi.fn(
        () =>
          new Promise<never>(() => {
            // Keep the request pending so the loading placement can be asserted.
          }),
      ),
    };

    renderControlledInput({ reader });

    await user.click(screen.getByPlaceholderText('book'));

    const loading = await screen.findByRole('status');
    expect(loading.textContent).toContain('Loading Book…');
    expect(loading.parentElement?.className).toContain('max-h-64');
  });

  it('refreshes reflected rows whenever the picker is reopened', async () => {
    const user = userEvent.setup();
    const reader = {
      readEntityData: vi.fn().mockResolvedValue({
        entityName: 'Book',
        columns: [],
        rows: [],
        page: 1,
        pageSize: 6,
        totalCount: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      }),
    };

    renderControlledInput({ reader });

    const input = screen.getByPlaceholderText('book');
    await user.click(input);
    await waitFor(() => expect(reader.readEntityData).toHaveBeenCalledTimes(1));
    await user.tab();
    await waitFor(() => expect(screen.queryByText(/No rows found/)).toBeNull());
    await user.click(input);
    await waitFor(() => expect(reader.readEntityData).toHaveBeenCalledTimes(2));
  });

  it('lets users select an entity row and writes a canonical ref draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const reader = {
      readEntityData: vi.fn().mockResolvedValue({
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
      }),
    };

    renderControlledInput({ onChange, reader });

    await user.click(screen.getByPlaceholderText('book'));

    await waitFor(() => {
      expect(reader.readEntityData).toHaveBeenCalledWith({
        entityName: 'Book',
        search: '',
        pageSize: 6,
      });
    });

    const option = (await screen.findByText('Programming Book')).closest('button');

    expect(option).not.toBeNull();
    expect(within(option as HTMLButtonElement).getByText(/progbook/)).toBeTruthy();
    await user.click(option as HTMLButtonElement);

    expect(onChange).toHaveBeenLastCalledWith({
      book: {
        kind: 'entity-ref',
        entityName: 'Book',
        locator: {
          slug: 'progbook',
        },
      },
    });
    expect(screen.getByText('Programming Book')).toBeTruthy();
    expect(screen.getByText('progbook')).toBeTruthy();
  });

  it('uses reflected display metadata for option labels', async () => {
    const user = userEvent.setup();
    const reader = {
      readEntityData: vi.fn().mockResolvedValue({
        entityName: 'Book',
        columns: [],
        display: {
          primary: 'displayName',
          secondary: ['author.displayName'],
        },
        rows: [
          {
            id: 'book-1',
            displayName: 'Readable Book',
            slug: 'progbook',
            'author.displayName': 'Javi',
          },
        ],
        page: 1,
        pageSize: 6,
        totalCount: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      }),
    };

    renderControlledInput({ reader });

    await user.click(screen.getByPlaceholderText('book'));

    const option = (await screen.findByText('Readable Book')).closest('button');

    expect(option).not.toBeNull();
    expect(within(option as HTMLButtonElement).getByText(/Javi/)).toBeTruthy();
    expect(within(option as HTMLButtonElement).getByText(/progbook/)).toBeTruthy();
    expect(screen.queryByText('book-1')).toBeNull();
  });
});
