import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExplorerOperationDescriptor, ExplorerTaskDescriptor } from '../contracts/index.js';

import {
  ExplorerOperationIngress,
  ExplorerOperationMetadata,
  ExplorerTaskDetail,
} from './index.js';

type MockEditorProps = {
  value: string;
  path?: string;
};

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, path }: MockEditorProps) => (
    <textarea aria-label={path ?? 'Explorer editor'} readOnly value={value} />
  ),
}));

afterEach(cleanup);

const operation: ExplorerOperationDescriptor = {
  id: 'Book.getSharingInfo',
  entityName: 'Book',
  name: 'getSharingInfo',
  kind: 'domain',
  authority: 'server',
  exposure: 'bridge',
  hasBridgeQuery: true,
  bridgeQueryCount: 2,
  bridgeInvalidationCount: 1,
  execution: { atomicity: 'required' },
  conditions: {
    pre: [
      {
        id: 'Book.getSharingInfo.pre.distinctBooks',
        name: 'distinctBooks',
        phase: 'pre',
        expression: {
          version: 1,
          expression: {
            kind: 'not',
            operand: {
              kind: 'ref-identity',
              operator: 'is',
              left: { kind: 'input-ref', input: 'source' },
              right: { kind: 'input-ref', input: 'target' },
            },
          },
        },
        dependencies: [
          { kind: 'input-ref', input: 'source' },
          { kind: 'input-ref', input: 'target' },
        ],
        rejection: {
          reason: 'operation_condition_rejected',
          message: 'Operation condition "distinctBooks" was not satisfied.',
        },
      },
    ],
  },
  durable: {
    taskId: 'book.get-sharing-info',
    runtime: 'BookOps runtime',
    hasSubject: true,
    idempotencyPolicy: 'required',
    runRefSchema: {
      source: 'ontahi',
      summary: 'object with 3 fields',
      fields: [],
    },
    progressSchema: {
      source: 'not-declared',
      summary: 'unknown',
      fields: [],
    },
    finalOutputSchema: {
      source: 'not-declared',
      summary: 'unknown',
      fields: [],
    },
  },
  inputSchema: {
    source: 'not-declared',
    summary: 'unknown',
    fields: [],
  },
  resultSchema: {
    source: 'not-declared',
    summary: 'unknown',
    fields: [],
  },
};

const task: ExplorerTaskDescriptor = {
  id: 'book.import',
  entityName: 'Book',
  name: 'importBook',
  inputSchema: {
    source: 'ontahi',
    summary: 'object',
    fields: [
      {
        path: 'sourceUrl',
        type: 'string',
        required: true,
      },
    ],
  },
  progressSchema: {
    source: 'not-declared',
    summary: 'unknown',
    fields: [],
  },
  resultSchema: {
    source: 'not-declared',
    summary: 'unknown',
    fields: [],
  },
  steps: [
    {
      id: 'extract',
      inputSchema: {
        source: 'not-declared',
        summary: 'unknown',
        fields: [],
      },
      resultSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [
          {
            path: 'chapterCount',
            type: 'number',
            required: true,
          },
        ],
      },
    },
  ],
};

describe('Explorer operation detail panels', () => {
  it('renders operation metadata rows from a descriptor', () => {
    render(<ExplorerOperationMetadata operation={operation} />);

    expect(screen.getByText('Operation')).toBeTruthy();
    expect(screen.getByText('Book.getSharingInfo')).toBeTruthy();
    expect(screen.getByText('Bridge Query')).toBeTruthy();
    expect(screen.getByText('2 query key parts')).toBeTruthy();
    expect(screen.getByText('Invalidate')).toBeTruthy();
    expect(screen.getByText('1 invalidations')).toBeTruthy();
    expect(screen.getByText('BookOps runtime')).toBeTruthy();
    expect(screen.getByText('Atomicity')).toBeTruthy();
    expect(screen.getByText('Preconditions')).toBeTruthy();
    expect(screen.getByText('distinctBooks')).toBeTruthy();
    expect(screen.getAllByText('required')).toHaveLength(2);
  });

  it('renders operation ingress routes and empty state', () => {
    const { rerender } = render(<ExplorerOperationIngress operation={operation} />);

    expect(screen.getByText('No ingress routes for this operation.')).toBeTruthy();

    rerender(
      <ExplorerOperationIngress
        operation={{
          ...operation,
          ingressRoutes: [
            {
              kind: 'http',
              method: 'POST',
              route: '/api/books/share',
              provider: 'nextjs',
              channel: 'internal',
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('http')).toBeTruthy();
    expect(screen.getByText('POST')).toBeTruthy();
    expect(screen.getByText('nextjs')).toBeTruthy();
    expect(screen.getByText('internal')).toBeTruthy();
    expect(screen.getByText('/api/books/share')).toBeTruthy();
  });

  it('renders task input, return, and step schemas', () => {
    render(<ExplorerTaskDetail task={task} />);

    expect(screen.getByText('sourceUrl')).toBeTruthy();
    expect(screen.getByText('extract')).toBeTruthy();
    expect(screen.getByText('chapterCount')).toBeTruthy();
  });
});
