import { describe, expect, it } from 'vitest';

import { createPostgresEventSchemaSql, resolvePostgresEventTableNames } from './schema.js';

describe('PostgreSQL Event schema contract', () => {
  it('uses conventional host-owned table names', () => {
    expect(resolvePostgresEventTableNames()).toEqual({
      occurrences: 'ontahi_event_occurrences',
      subscriptions: 'ontahi_event_subscriptions',
      deliveries: 'ontahi_event_deliveries',
    });
    expect(createPostgresEventSchemaSql()).toHaveLength(5);
    const sql = createPostgresEventSchemaSql().join('\n');
    expect(sql).toContain('CREATE TABLE "ontahi_event_occurrences"');
    expect(sql).toContain('acceptance_order bigserial NOT NULL UNIQUE');
    expect(sql).toContain('(event_id, event_version, acceptance_order)');
  });

  it('quotes custom identifiers and rejects empty names', () => {
    const sql = createPostgresEventSchemaSql({
      occurrences: 'facts"retained',
      subscriptions: 'event_subscribers',
      deliveries: 'event_deliveries',
    }).join('\n');
    expect(sql).toContain('"facts""retained"');
    expect(() => createPostgresEventSchemaSql({ occurrences: ' ' })).toThrow('non-empty');
  });
});
