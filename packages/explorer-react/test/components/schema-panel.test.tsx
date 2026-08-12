import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplorerSchemaPanel } from '../../src/components/index.js';
import type { ExplorerSchemaDescriptor } from '../../src/contracts/index.js';

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

describe('ExplorerSchemaPanel', () => {
  it('toggles a schema between field tree and raw JSON', async () => {
    const user = userEvent.setup();
    const schema: ExplorerSchemaDescriptor = {
      source: 'ontahi',
      summary: 'object',
      fields: [
        {
          path: 'bookSlug',
          type: 'string',
          required: true,
        },
      ],
      jsonSchema: {
        type: 'object',
        properties: {
          bookSlug: {
            type: 'string',
          },
        },
      },
    };

    render(<ExplorerSchemaPanel title='Input' schema={schema} />);

    expect(screen.getByText('bookSlug')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const jsonEditor = screen.getByLabelText('ontahi-explorer://schema/input.json');
    expect(jsonEditor.textContent).toBe(JSON.stringify(schema.jsonSchema, null, 2));
    expect(screen.queryByText('bookSlug')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Fields' }));

    expect(screen.getByText('bookSlug')).toBeTruthy();
  });

  it('summarizes undeclared schemas without showing a JSON toggle', () => {
    render(
      <ExplorerSchemaPanel
        title='Return'
        schema={{
          source: 'not-declared',
          summary: 'No schema declared',
          fields: [],
        }}
      />,
    );

    expect(screen.getByText('?')).toBeTruthy();
    expect(screen.getByText('No schema declared')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'JSON' })).toBeNull();
  });
});
