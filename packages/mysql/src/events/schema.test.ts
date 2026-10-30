import { describe, expect, it } from 'vitest';

import { createMysqlEventSchemaSql, resolveMysqlEventTableNames } from './schema.js';

describe('MySQL Event schema contract', () => {
  it('uses conventional host-owned InnoDB table names and acceptance ordering', () => {
    expect(resolveMysqlEventTableNames()).toEqual({
      occurrences: 'ontahi_event_occurrences',
      subscriptions: 'ontahi_event_subscriptions',
      deliveries: 'ontahi_event_deliveries',
    });
    const sql = createMysqlEventSchemaSql().join('\n');
    expect(createMysqlEventSchemaSql()).toHaveLength(3);
    expect(sql).toContain('CREATE TABLE `ontahi_event_occurrences`');
    expect(sql).toContain('acceptance_order bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE');
    expect(sql.match(/COLLATE utf8mb4_0900_bin/g)?.length).toBeGreaterThanOrEqual(8);
    expect(sql).toContain('(event_id, event_version, acceptance_order)');
    expect(sql).toContain('`ontahi_event_deliveries_inspection_idx`');
    expect(sql).toContain('(subscription_id, created_at, delivery_id)');
    expect(sql.match(/ENGINE=InnoDB/g)).toHaveLength(3);
  });

  it('quotes custom identifiers and rejects empty names', () => {
    const sql = createMysqlEventSchemaSql({
      occurrences: 'facts`retained',
      subscriptions: 'event_subscribers',
      deliveries: 'event_deliveries',
    }).join('\n');
    expect(sql).toContain('`facts``retained`');
    expect(() => createMysqlEventSchemaSql({ occurrences: ' ' })).toThrow('non-empty');
    expect(() => createMysqlEventSchemaSql({ occurrences: 'x'.repeat(55) })).toThrow(
      '64 characters or fewer',
    );
  });
});
