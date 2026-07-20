import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { describeRuntimeSchema, undeclaredResultSchema } from '../../src/server/index.js';

const expectPlainObjects = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      expectPlainObjects(item);
    }
    return;
  }

  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);

  for (const child of Object.values(value)) {
    expectPlainObjects(child);
  }
};

describe('graph ops schema descriptor', () => {
  it('describes zod object fields as a compact contract', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        bookSlug: z.string(),
        limit: z.number().optional(),
        filters: z
          .object({
            language: z.string().nullable(),
          })
          .optional(),
      }),
    );

    expect(descriptor).toMatchObject({
      source: 'zod',
      summary: 'object with 3 fields',
    });
    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'bookSlug', type: 'string', required: true }),
        expect.objectContaining({ path: 'limit', required: false }),
        expect.objectContaining({ path: 'filters.language', required: false }),
      ]),
    );
    expect(descriptor.jsonSchema).toEqual(expect.objectContaining({ type: 'object' }));
  });

  it('returns plain JSON schema objects for client component props', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        kind: z.literal('import'),
        tags: z.array(z.string()),
        payload: z.object({
          enabled: z.boolean(),
        }),
      }),
    );

    expectPlainObjects(descriptor.jsonSchema);
  });

  it('preserves string enum values for richer input controls', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        sort: z.enum(['book_order', 'recent_activity', 'newest']).optional(),
      }),
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'sort',
          enumValues: ['book_order', 'recent_activity', 'newest'],
        }),
      ]),
    );
  });

  it('preserves boolean presentation metadata for richer controls', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        isPending: z
          .boolean()
          .optional()
          .meta({
            presentation: {
              booleanLabels: {
                true: 'Pending invite',
                false: 'Active collaborator',
                unset: 'Default',
              },
            },
          }),
      }),
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'isPending',
          presentation: {
            booleanLabels: {
              true: 'Pending invite',
              false: 'Active collaborator',
              unset: 'Default',
            },
          },
        }),
      ]),
    );
  });

  it('reflects input union variants without losing the merged field contract', () => {
    const BookTarget = z
      .object({
        kind: z.literal('book'),
        slug: z.string(),
      })
      .meta({ id: 'BookTarget' });
    const ProfileTarget = z
      .object({
        kind: z.literal('profile'),
        email: z.string(),
      })
      .meta({ id: 'ProfileTarget' });
    const descriptor = describeRuntimeSchema(
      z.object({
        target: z.union([BookTarget, ProfileTarget]),
      }),
    );
    const target = descriptor.fields.find(field => field.path === 'target');

    expect(target).toEqual(
      expect.objectContaining({
        path: 'target',
        type: 'BookTarget | ProfileTarget',
        variants: [
          expect.objectContaining({
            type: 'BookTarget',
            fields: expect.arrayContaining([
              expect.objectContaining({ path: 'target.kind', type: '"book"' }),
              expect.objectContaining({ path: 'target.slug', type: 'string' }),
            ]),
          }),
          expect.objectContaining({
            type: 'ProfileTarget',
            fields: expect.arrayContaining([
              expect.objectContaining({ path: 'target.kind', type: '"profile"' }),
              expect.objectContaining({ path: 'target.email', type: 'string' }),
            ]),
          }),
        ],
      }),
    );
    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'target.kind', type: '"book" | "profile"' }),
        expect.objectContaining({ path: 'target.slug', type: 'string' }),
        expect.objectContaining({ path: 'target.email', type: 'string' }),
      ]),
    );
  });

  it('describes empty input objects as operations without parameters', () => {
    const descriptor = describeRuntimeSchema(z.object({}));

    expect(descriptor).toMatchObject({
      source: 'zod',
      summary: 'no input fields',
      fields: [],
    });
  });

  it('flattens array item fields for collection outputs', () => {
    const descriptor = describeRuntimeSchema(
      z.array(
        z.object({
          slug: z.string(),
          title: z.string(),
          version: z.string(),
        }),
      ),
      { io: 'output' },
    );

    expect(descriptor).toMatchObject({
      source: 'zod',
      summary: 'object[]',
    });
    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '[].slug', type: 'string', required: true }),
        expect.objectContaining({ path: '[].title', type: 'string', required: true }),
        expect.objectContaining({ path: '[].version', type: 'string', required: true }),
      ]),
    );
  });

  it('flattens object fields nested inside array properties', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        books: z.array(
          z.object({
            slug: z.string(),
            title: z.string(),
          }),
        ),
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'books', type: 'object[]', required: true }),
        expect.objectContaining({ path: 'books[].slug', type: 'string', required: true }),
        expect.objectContaining({ path: 'books[].title', type: 'string', required: true }),
      ]),
    );
  });

  it('does not duplicate scalar array item fields', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        columnAlignments: z.array(z.enum(['left', 'center', 'right'])).optional(),
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'columnAlignments',
          type: '("left" | "center" | "right")[]',
          required: false,
        }),
      ]),
    );
    expect(descriptor.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'columnAlignments[]' })]),
    );
  });

  it('flattens nullable object output fields', () => {
    const descriptor = describeRuntimeSchema(
      z
        .object({
          chapter: z.object({
            id: z.string(),
            title: z.string(),
            sections: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
              }),
            ),
          }),
          partTitle: z.string().nullable(),
        })
        .nullable(),
      { io: 'output' },
    );

    expect(descriptor).toMatchObject({
      source: 'zod',
      summary: 'object with 2 fields | null',
    });
    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'chapter', type: 'object', required: true }),
        expect.objectContaining({ path: 'chapter.id', type: 'string', required: true }),
        expect.objectContaining({ path: 'chapter.title', type: 'string', required: true }),
        expect.objectContaining({ path: 'chapter.sections', type: 'object[]', required: true }),
        expect.objectContaining({ path: 'chapter.sections[].id', type: 'string', required: true }),
        expect.objectContaining({
          path: 'chapter.sections[].title',
          type: 'string',
          required: true,
        }),
        expect.objectContaining({ path: 'partTitle', type: 'string | null', required: true }),
      ]),
    );
  });

  it('flattens object fields inside nullable properties', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        prev: z
          .object({
            partSlug: z.string(),
            chapterSlug: z.string(),
            title: z.string(),
          })
          .nullable(),
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'prev', type: 'object | null', required: true }),
        expect.objectContaining({ path: 'prev.partSlug', type: 'string', required: true }),
        expect.objectContaining({ path: 'prev.chapterSlug', type: 'string', required: true }),
        expect.objectContaining({ path: 'prev.title', type: 'string', required: true }),
      ]),
    );
  });

  it('describes discriminated object arrays by their variants', () => {
    const descriptor = describeRuntimeSchema(
      z.object({
        content: z.array(
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal('paragraph'),
              text: z.string(),
            }),
            z.object({
              type: z.literal('code'),
              code: z.string(),
              language: z.string().optional(),
            }),
          ]),
        ),
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'content', type: '(paragraph | code)[]' }),
        expect.objectContaining({ path: 'content[].type', type: '"paragraph" | "code"' }),
        expect.objectContaining({ path: 'content[].text', type: 'string' }),
        expect.objectContaining({ path: 'content[].code', type: 'string' }),
      ]),
    );
  });

  it('keeps named schema refs while expanding their fields', () => {
    const Viewer = z
      .object({
        isSignedIn: z.boolean(),
      })
      .meta({ id: 'GraphOpsViewerContract' });
    const descriptor = describeRuntimeSchema(
      z.object({
        viewer: Viewer,
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'viewer', type: 'GraphOpsViewerContract' }),
        expect.objectContaining({ path: 'viewer.isSignedIn', type: 'boolean' }),
      ]),
    );
  });

  it('keeps undeclared result schemas explicit', () => {
    expect(undeclaredResultSchema()).toEqual({
      source: 'not-declared',
      summary: 'Return type is TypeScript-only; no runtime result schema is declared yet.',
      fields: [],
    });
  });
});
