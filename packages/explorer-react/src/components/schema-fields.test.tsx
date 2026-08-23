import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import type { ExplorerSchemaDescriptor } from '../contracts/index.js';

import { ExplorerFieldRow, ExplorerSchemaFields, ExplorerSchemaStatusBadge } from './index.js';

afterEach(cleanup);

describe('Explorer schema fields', () => {
  it('renders field rows with required metadata', () => {
    render(<ExplorerFieldRow name='slug' type='text' required />);

    expect(screen.getByText('slug')).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
    expect(screen.getByText('required')).toBeTruthy();
  });

  it('renders schema fields as a hierarchical field tree', () => {
    const schema: ExplorerSchemaDescriptor = {
      source: 'ontahi',
      summary: 'object',
      fields: [
        {
          path: 'chapter',
          type: 'object',
          required: true,
        },
        {
          path: 'chapter.title',
          type: 'string',
          required: true,
        },
        {
          path: 'chapter.content',
          type: '(paragraph | code)[]',
          required: true,
        },
        {
          path: 'chapter.content[].type',
          type: '"paragraph" | "code"',
          required: true,
        },
        {
          path: 'chapter.content[].text',
          type: 'string',
          required: false,
        },
        {
          path: 'partTitle',
          type: 'string | null',
          required: true,
        },
      ],
    };

    const { container } = render(<ExplorerSchemaFields schema={schema} />);

    expect(screen.getByText('chapter')).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
    expect(screen.getByText('(paragraph | code)[]')).toBeTruthy();
    expect(screen.getByText('partTitle')).toBeTruthy();
    expect(container.textContent).not.toContain('chapter.content[].type');
  });

  it('renders schema union variants as selectable branches', async () => {
    const user = userEvent.setup();
    const schema: ExplorerSchemaDescriptor = {
      source: 'ontahi',
      summary: 'object',
      fields: [
        {
          path: 'book',
          type: 'ChapterPageAccessDeniedBook | ChapterPageBookShell',
          required: true,
          variants: [
            {
              type: 'ChapterPageAccessDeniedBook',
              fields: [
                {
                  path: 'book.slug',
                  type: 'string',
                  required: true,
                },
                {
                  path: 'book.title',
                  type: 'string',
                  required: true,
                },
              ],
            },
            {
              type: 'ChapterPageBookShell',
              fields: [
                {
                  path: 'book.id',
                  type: 'string | null',
                  required: true,
                },
                {
                  path: 'book.version',
                  type: 'string',
                  required: true,
                },
              ],
            },
          ],
        },
      ],
    };

    render(<ExplorerSchemaFields schema={schema} />);

    expect(
      screen
        .getByRole('tab', { name: 'ChapterPageAccessDeniedBook' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText('slug')).toBeTruthy();
    expect(screen.queryByText('id')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'ChapterPageBookShell' }));

    expect(
      screen.getByRole('tab', { name: 'ChapterPageBookShell' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText('id')).toBeTruthy();
    expect(screen.queryByText('slug')).toBeNull();
  });

  it('renders status badges for unknown and undeclared schemas', () => {
    const { rerender } = render(
      <ExplorerSchemaStatusBadge
        schema={{
          source: 'not-declared',
          summary: 'No schema declared',
          fields: [],
        }}
      />,
    );

    expect(screen.getByText('?')).toBeTruthy();

    rerender(
      <ExplorerSchemaStatusBadge
        schema={{
          source: 'unknown',
          summary: 'Schema could not be described',
          fields: [],
        }}
      />,
    );

    expect(screen.getByText('unknown')).toBeTruthy();
  });
});
