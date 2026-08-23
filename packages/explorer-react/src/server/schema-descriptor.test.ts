import { entity, field, graphSchema, value } from '@ontahi/core/data-graph';
import { describe, expect, it } from 'vitest';

import { describeRuntimeSchema, undeclaredResultSchema } from './index.js';

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
  it('preserves void output semantics', () => {
    expect(describeRuntimeSchema(graphSchema.void(), { io: 'output' })).toEqual({
      source: 'ontahi',
      summary: 'void',
      fields: [],
      jsonSchema: {},
    });
    expect(
      describeRuntimeSchema(graphSchema.named('CommandOutput', graphSchema.void()), {
        io: 'output',
      }),
    ).toEqual({
      source: 'ontahi',
      summary: 'void',
      fields: [],
      jsonSchema: { title: 'CommandOutput' },
    });
  });

  it('preserves selection semantics for Explorer controls', () => {
    const Notification = entity('UserNotification', {
      id: field.id(),
    })
      .locators({ refById: 'id' })
      .identity('refById');
    const descriptor = describeRuntimeSchema(
      value('MarkNotificationsReadInput', {
        notifications: graphSchema.selection(Notification, { cardinality: 'many' }),
      }),
    );

    expect(descriptor.fields).toEqual([
      expect.objectContaining({
        path: 'notifications',
        type: 'Selection<UserNotification>',
        selection: {
          entityName: 'UserNotification',
          cardinality: 'many',
          identity: { name: 'refById', fields: ['id'] },
        },
      }),
    ]);
  });

  it('describes Ontahi object fields as a compact contract', () => {
    const descriptor = describeRuntimeSchema(
      value('BookQueryInput', {
        bookSlug: field.string(),
        limit: field.optional(field.number()),
        filters: graphSchema.optional(
          value('BookQueryFilters', {
            language: field.nullable(field.string()),
          }),
        ),
      }),
    );

    expect(descriptor).toMatchObject({
      source: 'ontahi',
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
      value('ImportInput', {
        kind: graphSchema.literal('import'),
        tags: graphSchema.array(field.string()),
        payload: value('ImportPayload', {
          enabled: field.boolean(),
        }),
      }),
    );

    expectPlainObjects(descriptor.jsonSchema);
  });

  it('preserves string enum values for richer input controls', () => {
    const descriptor = describeRuntimeSchema(
      value('SortedQueryInput', {
        sort: field.optional(field.enum(['book_order', 'recent_activity', 'newest'] as const)),
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
      value('RemoveCollaboratorInput', {
        isPending: field.optional(
          graphSchema.present(field.boolean(), {
            booleanLabels: {
              true: 'Pending invite',
              false: 'Active collaborator',
              unset: 'Default',
            },
          }),
        ),
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
    const BookTarget = value('BookTarget', {
      kind: graphSchema.literal('book'),
      slug: field.string(),
    });
    const ProfileTarget = value('ProfileTarget', {
      kind: graphSchema.literal('profile'),
      email: field.string(),
    });
    const descriptor = describeRuntimeSchema(
      value('TargetInput', {
        target: graphSchema.union([BookTarget, ProfileTarget]),
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

  it('preserves named field variants merged across result branches', () => {
    const descriptor = describeRuntimeSchema(
      graphSchema.discriminatedUnion('state', [
        value('DeniedResult', {
          state: graphSchema.literal('denied'),
          subject: value('DeniedSubject', {
            slug: field.string(),
          }),
        }),
        value('ReadyResult', {
          state: graphSchema.literal('ready'),
          subject: value('ReadySubject', {
            id: field.string(),
          }),
        }),
      ]),
      { io: 'output' },
    );

    expect(descriptor.fields.find(field => field.path === 'subject')).toEqual(
      expect.objectContaining({
        type: 'DeniedSubject | ReadySubject',
        variants: [
          expect.objectContaining({
            type: 'DeniedSubject',
            fields: [expect.objectContaining({ path: 'subject.slug', type: 'string' })],
          }),
          expect.objectContaining({
            type: 'ReadySubject',
            fields: [expect.objectContaining({ path: 'subject.id', type: 'string' })],
          }),
        ],
      }),
    );
  });

  it('describes empty input objects as operations without parameters', () => {
    const descriptor = describeRuntimeSchema(value('EmptyInput', {}));

    expect(descriptor).toMatchObject({
      source: 'ontahi',
      summary: 'no input fields',
      fields: [],
    });
  });

  it('flattens array item fields for collection outputs', () => {
    const descriptor = describeRuntimeSchema(
      graphSchema.array(
        value('BookSummary', {
          slug: field.string(),
          title: field.string(),
          version: field.string(),
        }),
      ),
      { io: 'output' },
    );

    expect(descriptor).toMatchObject({
      source: 'ontahi',
      summary: 'BookSummary[]',
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
      value('BookList', {
        books: graphSchema.array(
          value('BookListItem', {
            slug: field.string(),
            title: field.string(),
          }),
        ),
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'books', type: 'BookListItem[]', required: true }),
        expect.objectContaining({ path: 'books[].slug', type: 'string', required: true }),
        expect.objectContaining({ path: 'books[].title', type: 'string', required: true }),
      ]),
    );
  });

  it('does not duplicate scalar array item fields', () => {
    const descriptor = describeRuntimeSchema(
      value('TableBlock', {
        columnAlignments: graphSchema.optional(
          graphSchema.array(field.enum(['left', 'center', 'right'] as const)),
        ),
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
      graphSchema.nullable(
        value('FetchChapterResult', {
          chapter: value('ChapterNode', {
            id: field.string(),
            title: field.string(),
            sections: graphSchema.array(
              value('SectionNode', {
                id: field.string(),
                title: field.string(),
              }),
            ),
          }),
          partTitle: field.nullable(field.string()),
        }),
      ),
      { io: 'output' },
    );

    expect(descriptor).toMatchObject({
      source: 'ontahi',
      summary: 'FetchChapterResult | null',
    });
    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'chapter', type: 'ChapterNode', required: true }),
        expect.objectContaining({ path: 'chapter.id', type: 'string', required: true }),
        expect.objectContaining({ path: 'chapter.title', type: 'string', required: true }),
        expect.objectContaining({
          path: 'chapter.sections',
          type: 'SectionNode[]',
          required: true,
        }),
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
      value('ChapterNavigation', {
        prev: graphSchema.nullable(
          value('ChapterNavigationRef', {
            partSlug: field.string(),
            chapterSlug: field.string(),
            title: field.string(),
          }),
        ),
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'prev',
          type: 'ChapterNavigationRef | null',
          required: true,
        }),
        expect.objectContaining({ path: 'prev.partSlug', type: 'string', required: true }),
        expect.objectContaining({ path: 'prev.chapterSlug', type: 'string', required: true }),
        expect.objectContaining({ path: 'prev.title', type: 'string', required: true }),
      ]),
    );
  });

  it('describes discriminated object arrays by their variants', () => {
    const descriptor = describeRuntimeSchema(
      value('ChapterContent', {
        content: graphSchema.array(
          graphSchema.discriminatedUnion('type', [
            value('ParagraphBlock', {
              type: graphSchema.literal('paragraph'),
              text: field.string(),
            }),
            value('CodeBlock', {
              type: graphSchema.literal('code'),
              code: field.string(),
              language: field.optional(field.string()),
            }),
          ]),
        ),
      }),
      { io: 'output' },
    );

    expect(descriptor.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'content',
          type: '(ParagraphBlock | CodeBlock)[]',
        }),
        expect.objectContaining({ path: 'content[].type', type: '"paragraph" | "code"' }),
        expect.objectContaining({ path: 'content[].text', type: 'string' }),
        expect.objectContaining({ path: 'content[].code', type: 'string' }),
      ]),
    );
  });

  it('keeps named schema refs while expanding their fields', () => {
    const Viewer = value('GraphOpsViewerContract', {
      isSignedIn: field.boolean(),
    });
    const descriptor = describeRuntimeSchema(
      value('ViewerResult', {
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
