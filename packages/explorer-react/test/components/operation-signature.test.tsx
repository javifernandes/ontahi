import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ExplorerOperationSignature } from '../../src/components/index.js';
import type { ExplorerOperationDescriptor } from '../../src/contracts/index.js';

afterEach(cleanup);

const buildOperation = (
  overrides: Partial<ExplorerOperationDescriptor> = {},
): ExplorerOperationDescriptor => ({
  id: 'BookCollaborators.invite',
  entityName: 'BookCollaborators',
  name: 'invite',
  kind: 'domain',
  authority: 'server',
  exposure: 'bridge',
  inputSchema: {
    source: 'zod',
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
      {
        path: 'sendEmail',
        type: 'boolean',
        required: true,
      },
      {
        path: 'metadata',
        type: 'Record<string, unknown>',
        required: false,
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
  resultSchema: {
    source: 'not-declared',
    summary: 'unknown',
    fields: [],
  },
  ...overrides,
});

describe('ExplorerOperationSignature', () => {
  it('renders a compact inline developer signature with hidden parameter count', () => {
    const { container } = render(
      <ExplorerOperationSignature operation={buildOperation()} maxInlineParameters={2} />,
    );

    expect(screen.getByText('BookCollaborators.invite')).toBeTruthy();
    expect(screen.getByText('book')).toBeTruthy();
    expect(screen.getByText('Book')).toBeTruthy();
    expect(screen.getByText('email')).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
    expect(screen.getByText('[+2]')).toBeTruthy();
    expect(container.textContent).not.toContain('bookSlug');
  });

  it('uses a stacked list for operation navigation and infers entity-like slug inputs', () => {
    render(
      <ExplorerOperationSignature
        operation={buildOperation({
          id: 'Book.getSharingInfo',
          entityName: 'Book',
          name: 'getSharingInfo',
          inputRefs: [],
          inputSchema: {
            source: 'zod',
            summary: 'object',
            fields: [
              {
                path: 'bookSlug',
                type: 'string',
                required: true,
              },
            ],
          },
        })}
        variant='stacked'
      />,
    );

    expect(screen.getByText('Book.getSharingInfo')).toBeTruthy();

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('book')).toBeTruthy();
    expect(within(row).getByText('Book')).toBeTruthy();
    expect(row.textContent).not.toContain('bookSlug');
  });

  it('uses boolean presentation labels when available', () => {
    render(
      <ExplorerOperationSignature
        operation={buildOperation({
          inputRefs: [],
          inputSchema: {
            source: 'zod',
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
                  },
                },
              },
            ],
          },
        })}
        variant='stacked'
      />,
    );

    const row = screen.getByRole('listitem');
    expect(within(row).getByText('isPending')).toBeTruthy();
    expect(within(row).getByText('pending invite/active collaborator')).toBeTruthy();
  });
});
