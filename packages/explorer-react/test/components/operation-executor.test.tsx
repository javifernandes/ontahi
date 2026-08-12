import { describe, expect, it } from 'vitest';

import {
  buildExplorerOperationInputDraft,
  formatExplorerOperationInputDraft,
  getExplorerEntityRefInputFieldValue,
  getExplorerEntityRefInputLocator,
  getExplorerInputFieldDraftValue,
  getExplorerOperationScalarInputFields,
  isExplorerOperationExecutable,
  isExplorerOperationPotentiallyDestructive,
  parseExplorerOperationInputText,
  updateExplorerEntityRefInputDraft,
  updateExplorerInputFieldDraft,
  validateExplorerOperationInput,
} from '../../src/components/operation-executor.js';
import type { ExplorerOperationDescriptor } from '../../src/contracts/index.js';

const buildOperation = (
  overrides: Partial<ExplorerOperationDescriptor> = {},
): ExplorerOperationDescriptor => ({
  id: 'Book.fetchBookInfo',
  entityName: 'Book',
  name: 'fetchBookInfo',
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
      {
        path: 'language',
        type: 'string',
        required: false,
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

const bookInputRef = {
  path: 'book',
  entityName: 'Book',
  receiver: false,
  optional: false,
  locators: [
    {
      name: 'refBySlug',
      fields: ['bookSlug', 'slug', 'book.slug'],
      sourceFields: ['slug'],
    },
  ],
};

const chapterInputRef = {
  path: 'chapter',
  entityName: 'ContentNode',
  receiver: false,
  optional: false,
  locators: [
    {
      name: 'refById',
      fields: ['chapterId', 'id', 'chapter.id'],
      sourceFields: ['id'],
    },
    {
      name: 'refByBookChapterPath',
      fields: [
        'chapterBookSlug',
        'chapterPartSlug',
        'chapterChapterSlug',
        'bookSlug',
        'partSlug',
        'chapterSlug',
        'chapter.bookSlug',
        'chapter.partSlug',
        'chapter.chapterSlug',
      ],
      sourceFields: ['bookSlug', 'partSlug', 'chapterSlug'],
    },
  ],
};

describe('useExplorerOperationExecutor helpers', () => {
  it('builds a JSON input draft from top-level schema fields', () => {
    expect(buildExplorerOperationInputDraft(buildOperation().inputSchema)).toEqual({
      bookSlug: '',
      language: null,
    });
  });

  it('builds a semantic input draft from operation input refs', () => {
    expect(
      buildExplorerOperationInputDraft(
        buildOperation({
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
            bookInputRef,
            {
              path: 'invitee',
              entityName: 'Profile',
              receiver: false,
              optional: true,
              locators: [
                {
                  name: 'refByEmail',
                  fields: ['inviteeEmail', 'email', 'invitee.email'],
                  sourceFields: ['email'],
                },
              ],
            },
          ],
        }),
      ),
    ).toEqual({
      book: {
        kind: 'entity-ref',
        entityName: 'Book',
        locator: {
          slug: '',
        },
      },
      invitee: {
        kind: 'entity-ref',
        entityName: 'Profile',
        locator: {
          email: '',
        },
      },
    });
  });

  it('prefers the locator that best matches the operation input schema', () => {
    expect(
      buildExplorerOperationInputDraft(
        buildOperation({
          id: 'Book.fetchChapterNavigation',
          entityName: 'Book',
          name: 'fetchChapterNavigation',
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
          inputRefs: [chapterInputRef],
        }),
      ),
    ).toEqual({
      chapter: {
        kind: 'entity-ref',
        entityName: 'ContentNode',
        locator: {
          bookSlug: '',
          partSlug: '',
          chapterSlug: '',
        },
      },
    });
  });

  it('formats semantic refs as contextual ref expressions', () => {
    expect(
      formatExplorerOperationInputDraft(
        buildOperation({
          id: 'Book.fetchChapterNavigation',
          entityName: 'Book',
          name: 'fetchChapterNavigation',
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
          inputRefs: [chapterInputRef],
        }),
      ),
    ).toContain('chapter: ref({');
  });

  it('parses contextual ref expressions into canonical entity refs', () => {
    expect(
      parseExplorerOperationInputText(
        {
          inputRefs: [chapterInputRef],
        },
        `
          chapter: ref({
            bookSlug: 'progbook',
            partSlug: 'the-building-blocks',
            chapterSlug: 'decomposition-and-composition',
          })
        `,
      ),
    ).toEqual({
      chapter: {
        kind: 'entity-ref',
        entityName: 'ContentNode',
        locator: {
          bookSlug: 'progbook',
          partSlug: 'the-building-blocks',
          chapterSlug: 'decomposition-and-composition',
        },
      },
    });
  });

  it('parses compact JSON ref values into canonical entity refs', () => {
    expect(
      parseExplorerOperationInputText(
        {
          inputRefs: [chapterInputRef],
        },
        JSON.stringify({
          chapter: {
            $ref: {
              bookSlug: 'progbook',
              partSlug: null,
              chapterSlug: 'intro',
            },
          },
        }),
      ),
    ).toEqual({
      chapter: {
        kind: 'entity-ref',
        entityName: 'ContentNode',
        locator: {
          bookSlug: 'progbook',
          partSlug: null,
          chapterSlug: 'intro',
        },
      },
    });
  });

  it('lists scalar form fields that are not represented by entity refs', () => {
    const operation = buildOperation({
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
          {
            path: 'message',
            type: 'string',
            required: false,
          },
        ],
      },
      inputRefs: [
        bookInputRef,
        {
          path: 'invitee',
          entityName: 'Profile',
          receiver: false,
          optional: true,
          locators: [
            {
              name: 'refByEmail',
              fields: ['inviteeEmail', 'email', 'invitee.email'],
              sourceFields: ['email'],
            },
          ],
        },
      ],
    });

    expect(getExplorerOperationScalarInputFields(operation).map(field => field.path)).toEqual([
      'message',
    ]);
  });

  it('reads and updates semantic entity ref drafts', () => {
    const input = {
      bookSlug: 'old-slug',
      email: 'reader@example.com',
      book: {
        kind: 'entity-ref',
        entityName: 'Book',
        locator: {
          slug: 'current-slug',
        },
      },
    };

    expect(getExplorerEntityRefInputLocator(input, bookInputRef)?.name).toBe('refBySlug');
    expect(getExplorerEntityRefInputFieldValue(input, bookInputRef, 'slug')).toBe('current-slug');

    expect(
      updateExplorerEntityRefInputDraft({
        input,
        inputRef: bookInputRef,
        locatorName: 'refBySlug',
        sourceField: 'slug',
        value: 'progbook',
      }),
    ).toEqual({
      email: 'reader@example.com',
      book: {
        kind: 'entity-ref',
        entityName: 'Book',
        locator: {
          slug: 'progbook',
        },
      },
    });

    expect(
      updateExplorerEntityRefInputDraft({
        input,
        inputRef: bookInputRef,
        locatorName: 'refBySlug',
        sourceField: 'slug',
        value: 'ignored-fallback',
        locatorValues: {
          slug: 'selected-row-slug',
        },
      }),
    ).toMatchObject({
      book: {
        locator: {
          slug: 'selected-row-slug',
        },
      },
    });
  });

  it('reads and updates regular input fields in the draft', () => {
    const input = {
      bookSlug: 'progbook',
      dryRun: false,
    };

    expect(getExplorerInputFieldDraftValue(input, 'bookSlug')).toBe('progbook');
    expect(
      updateExplorerInputFieldDraft({
        input,
        path: 'dryRun',
        value: true,
      }),
    ).toEqual({
      bookSlug: 'progbook',
      dryRun: true,
    });
  });

  it('reports missing required scalar inputs without rejecting valid false, zero, or null values', () => {
    const operation = buildOperation({
      inputSchema: {
        source: 'ontahi',
        summary: 'object',
        fields: [
          { path: 'confirmation', type: 'string', required: true },
          { path: 'count', type: 'number', required: true },
          { path: 'enabled', type: 'boolean', required: true },
          { path: 'parentSlug', type: 'string | null', required: true },
          { path: 'note', type: 'string', required: false },
        ],
      },
    });

    expect(
      validateExplorerOperationInput(operation, {
        confirmation: '   ',
        count: 0,
        enabled: false,
        parentSlug: null,
        note: '',
      }),
    ).toEqual([
      {
        path: 'confirmation',
        code: 'required',
        message: 'confirmation is required.',
      },
    ]);
  });

  it('reports a required entity ref until its selected locator is populated', () => {
    const operation = buildOperation({ inputRefs: [bookInputRef] });
    const input = buildExplorerOperationInputDraft(operation);

    expect(validateExplorerOperationInput(operation, input)).toEqual([
      {
        path: 'book',
        code: 'required',
        message: 'book is required.',
      },
    ]);
    expect(
      validateExplorerOperationInput(
        operation,
        updateExplorerEntityRefInputDraft({
          input,
          inputRef: bookInputRef,
          locatorName: 'refBySlug',
          sourceField: 'slug',
          value: 'progbook',
        }),
      ),
    ).toEqual([]);
  });

  it('marks bridged server operations and browser-direct graph operations executable', () => {
    expect(isExplorerOperationExecutable(buildOperation())).toBe(true);
    expect(isExplorerOperationExecutable(buildOperation({ kind: 'graph' }))).toBe(false);
    expect(
      isExplorerOperationExecutable(
        buildOperation({ kind: 'graph', authority: 'client-safe', exposure: 'browser-direct' }),
      ),
    ).toBe(true);
    expect(isExplorerOperationExecutable(buildOperation({ exposure: 'server-only' }))).toBe(false);
  });

  it('detects destructive operation names', () => {
    expect(
      isExplorerOperationPotentiallyDestructive(
        buildOperation({
          id: 'Book.deleteBook',
          name: 'deleteBook',
        }),
      ),
    ).toBe(true);
    expect(isExplorerOperationPotentiallyDestructive(buildOperation())).toBe(false);
  });
});
