import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildExplorerSnapshot, getExplorerEntityDetail } from '../../src/server/index.js';

describe('explorer descriptor builder', () => {
  it('builds reflected entity, operation, task, ingress, and event descriptors', () => {
    const snapshot = buildExplorerSnapshot({
      entities: [
        {
          name: 'Book',
          fields: {
            id: { fieldType: 'id' },
            title: { fieldType: 'string' },
            slug: { fieldType: 'string' },
          },
          relations: {
            chapters: {
              relationKind: 'many',
              target: { name: 'Chapter' },
            },
          },
          graph: { exposure: 'public' },
          displayMetadata: {
            primary: 'title',
            secondary: ['slug'],
            search: ['title', 'slug'],
          },
        },
      ],
      graphSummary: {
        entities: [
          {
            name: 'Book',
            graphOperationNames: ['load'],
            domainOperationNames: ['load', 'publish'],
            durableOperationNames: ['publish'],
            taskNames: ['sync'],
          },
        ],
      },
      graphOperations: [
        {
          id: 'Book.load',
          entityName: 'Book',
          name: 'load',
          authority: 'graph',
          exposure: 'public',
          input: z.object({ slug: z.string() }),
          output: z.object({ title: z.string() }),
        },
      ],
      domainOperations: [
        {
          id: 'Book.load',
          entityName: 'Book',
          name: 'load',
          authority: 'domain',
          exposure: 'bridge',
        },
        {
          id: 'Book.publish',
          entityName: 'Book',
          name: 'publish',
          authority: 'domain',
          exposure: 'bridge',
          inputRefs: {
            book: {
              kind: 'entity-ref-input',
              entityName: 'Book',
              inferredLocators: [
                {
                  name: 'refBySlug',
                  sourceFields: ['slug'],
                },
              ],
            },
          },
          durable: {
            taskId: 'book.publish',
            runtime: 'test-runtime',
            progress: z.object({ percent: z.number() }),
            finalOutput: z.object({ published: z.boolean() }),
            subject: {},
            idempotency: { policy: 'semantic' },
          },
        },
      ],
      tasks: [{ id: 'Book.sync', entityName: 'Book', name: 'sync' }],
      getTaskDefinition: () => ({
        input: z.object({ slug: z.string() }),
        progress: z.object({ percent: z.number() }),
        output: z.object({ published: z.boolean() }),
        steps: {
          fetch: {
            id: 'fetch',
            input: z.object({ slug: z.string() }),
          },
        },
      }),
      events: [
        {
          type: 'book_published',
          domain: 'publishing',
          actorScoped: true,
          payloadFields: [{ name: 'bookSlug', type: 'string' }],
          relatedEntities: ['Book'],
          handlers: ['notify'],
        },
      ],
      httpIngress: [
        {
          operationId: 'Book.publish',
          kind: 'http',
          method: 'POST',
          route: '/api/books/publish',
          provider: 'test',
          channel: 'books.publish',
        },
      ],
    });

    expect(snapshot.metrics).toEqual([
      { label: 'Entity kinds', value: 1 },
      { label: 'Operations', value: 2 },
      { label: 'Tasks', value: 1 },
      { label: 'Event kinds', value: 1 },
    ]);
    expect(snapshot.entities[0]).toEqual(
      expect.objectContaining({
        name: 'Book',
        display: {
          primary: 'title',
          secondary: ['slug'],
          search: ['title', 'slug'],
        },
      }),
    );
    expect(snapshot.operations.map(operation => operation.id)).toEqual([
      'Book.load',
      'Book.publish',
    ]);
    expect(snapshot.operations.find(operation => operation.id === 'Book.publish')).toEqual(
      expect.objectContaining({
        kind: 'durable',
        durable: {
          taskId: 'book.publish',
          runtime: 'test-runtime',
          hasSubject: true,
          idempotencyPolicy: 'semantic',
          runRefSchema: expect.objectContaining({
            source: 'zod',
            summary: 'object with 4 fields',
          }),
          progressSchema: expect.objectContaining({
            source: 'zod',
            summary: 'object with 1 field',
          }),
          finalOutputSchema: expect.objectContaining({
            source: 'zod',
            summary: 'object with 1 field',
          }),
        },
        ingressRoutes: [
          {
            kind: 'http',
            method: 'POST',
            route: '/api/books/publish',
            provider: 'test',
            channel: 'books.publish',
          },
        ],
        inputRefs: [
          {
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
          },
        ],
      }),
    );
    expect(snapshot.tasks[0]?.steps[0]?.inputSchema).toEqual(
      expect.objectContaining({
        source: 'zod',
        summary: 'object with 1 field',
      }),
    );
    expect(snapshot.tasks[0]).toEqual(
      expect.objectContaining({
        progressSchema: expect.objectContaining({ summary: 'object with 1 field' }),
        resultSchema: expect.objectContaining({ summary: 'object with 1 field' }),
      }),
    );
  });

  it('builds entity details with relation diagrams', () => {
    const detail = getExplorerEntityDetail(
      {
        entities: [
          {
            name: 'Book',
            fields: {
              id: { fieldType: 'id' },
              status: { fieldType: 'enum', enumValues: ['draft', 'published'] },
            },
            relations: {
              chapters: {
                relationKind: 'many',
                target: { name: 'Chapter' },
              },
            },
          },
        ],
      },
      'Book',
    );

    expect(detail).toEqual(
      expect.objectContaining({
        name: 'Book',
        fields: expect.arrayContaining([
          {
            name: 'status',
            type: 'enum',
            nullable: false,
            enumValues: ['draft', 'published'],
          },
        ]),
        relations: [{ name: 'chapters', kind: 'many', target: 'Chapter' }],
      }),
    );
    expect(detail?.diagram).toContain('Book');
    expect(detail?.diagram).toContain('chapters (many)');
  });
});
