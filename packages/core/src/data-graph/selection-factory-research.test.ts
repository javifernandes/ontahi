import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { hasOwn, isRecord } from '../value/object.js';

import {
  createEntityIdentityRef,
  createEntityRef,
  createGraphClientCache,
  createGraphCommandDispatcher,
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  entity,
  entityRefsEqual,
  field,
  graphSchema,
  isExactEntityMutationDelta,
  lowerEntityReferenceValue,
  lowerSelectionReferences,
  mutateEntity,
  query,
  safeParseGraphSchema,
  Selection,
  toGraphCommandRequest,
  toGraphReadRequest,
  toGraphSchemaDescriptor,
  type EntityRef,
} from './index.js';

const Customer = entity('ResearchCustomer', {
  id: field.id(),
  slug: field.string(),
  loginEmail: field.string(),
  billingEmail: field.string(),
  archivedAt: field.datetime(),
}).locators({ bySlug: 'slug' });

const makeRows = () => [
  {
    id: 'c1',
    slug: 'first',
    loginEmail: 'a@x.test',
    billingEmail: 'b@x.test',
    archivedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c2',
    slug: 'second',
    loginEmail: 'b@x.test',
    billingEmail: 'a@x.test',
    archivedAt: '2026-08-01T00:00:00Z',
  },
];

// Plan 150a experiment only: a one-predicate data template, not a proposed public factory API.
// Deliberately has no callbacks, remote resolver, implicit composition, or cardinality override.
const emailInput = graphSchema.object({ email: field.string() });
const dateInput = graphSchema.object({ date: field.datetime() });

type FactoryFixture = {
  input: typeof emailInput | typeof dateInput;
  scalarInput?: string;
  template: { fieldName: string; operator: 'eq' | 'gte'; parameter: string };
};

const factories: Record<string, FactoryFixture> = {
  loginEmail: {
    input: emailInput,
    scalarInput: 'email',
    template: { fieldName: 'loginEmail', operator: 'eq', parameter: 'email' },
  },
  billingEmail: {
    input: emailInput,
    scalarInput: 'email',
    template: { fieldName: 'billingEmail', operator: 'eq', parameter: 'email' },
  },
  archivedSince: {
    input: dateInput,
    template: { fieldName: 'archivedAt', operator: 'gte', parameter: 'date' },
  },
};

const expandFixture = (invocation: Record<string, unknown>) => {
  const names = Object.keys(invocation);
  if (names.length !== 1) throw new Error('Choose one named alternative.');
  const name = names[0]!;
  if (!hasOwn(factories, name)) throw new Error('Unknown selection factory.');
  const factory = factories[name]!;
  const supplied = invocation[name];
  const input = isRecord(supplied)
    ? supplied
    : factory.scalarInput
      ? { [factory.scalarInput]: supplied }
      : supplied;
  const parsed = safeParseGraphSchema(factory.input, input);
  if (!parsed.success || !isRecord(parsed.data)) throw new Error('Invalid factory input.');
  return new Selection(Customer, {
    kind: 'predicate',
    fieldName: factory.template.fieldName,
    operator: factory.template.operator,
    value: (parsed.data as Record<string, unknown>)[factory.template.parameter],
  });
};

const runtimeFor = (rows = makeRows()) =>
  createInMemoryDataGraphRuntime({ entities: [Customer], dataset: { ResearchCustomer: rows } });

describe('Plan 150a: identity versus Selection factory experiments', () => {
  it('normalizes explicit scalar shorthand and reflects inputs independently from Entity Fields', () => {
    const objectForm = expandFixture({ loginEmail: { email: 'a@x.test' } });
    expect(expandFixture({ loginEmail: 'a@x.test' }).toAst()).toEqual(objectForm.toAst());
    expect(toGraphSchemaDescriptor(factories.archivedSince!.input)).toMatchObject({
      kind: 'object',
      fields: { date: { kind: 'scalar', type: 'string' } },
    });
    expect(Customer.fields).not.toHaveProperty('date');
    expect(Customer.fields).not.toHaveProperty('archivedSince');
    expect(objectForm.toAst()).toEqual({
      kind: 'selection',
      entityName: Customer.name,
      expression: { kind: 'predicate', fieldName: 'loginEmail', operator: 'eq', value: 'a@x.test' },
    });
  });

  it('distinguishes identical input schemas by the explicit factory name', async () => {
    const runtime = runtimeFor();
    expect(toGraphSchemaDescriptor(factories.loginEmail!.input)).toEqual(
      toGraphSchemaDescriptor(factories.billingEmail!.input),
    );
    const login = await Effect.runPromise(
      runtime.run(expandFixture({ loginEmail: 'a@x.test' }).toQuery().build(), undefined),
    );
    const billing = await Effect.runPromise(
      runtime.run(expandFixture({ billingEmail: 'a@x.test' }).toQuery().build(), undefined),
    );
    expect(login.map(row => row.id)).toEqual(['c1']);
    expect(billing.map(row => row.id)).toEqual(['c2']);
  });

  it.each<Record<string, unknown>>([
    {},
    { loginEmail: 'a', billingEmail: 'b' },
    { unknown: 'a' },
    { constructor: 'a' },
    { loginEmail: { email: 123 } },
    { archivedSince: '2026-01-01T00:00:00Z' },
    { archivedSince: { date: 'not-a-date' } },
  ])('rejects ambiguous or invalid factory input %j', input => {
    expect(() => expandFixture(input)).toThrow();
  });

  it('expands a pure parameterized criterion into the existing transport and runtime algebra', async () => {
    const selected = expandFixture({ archivedSince: { date: '2026-06-01T00:00:00Z' } });
    const request = toGraphReadRequest(selected.toQuery(), 'run');
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
    expect(request.selection.expression).toEqual({
      kind: 'predicate',
      fieldName: 'archivedAt',
      operator: 'gte',
      value: '2026-06-01T00:00:00Z',
    });
    const rows = await Effect.runPromise(runtimeFor().run(selected.toQuery().build(), undefined));
    expect(rows.map(row => row.id)).toEqual(['c2']);
    expect(selected.named('archivedSince').toAst()).toEqual(selected.toAst());
    expect(JSON.stringify(request)).not.toContain('archivedSince');
  });

  it('preserves membership but loses explicit-member intent when refs are lowered to predicates', async () => {
    const ref = createEntityRef(Customer, { id: 'c1' });
    const explicit = Selection.references(Customer, [ref]);
    const lowered = new Selection(Customer, lowerSelectionReferences(explicit.expression));
    const runtime = runtimeFor();
    expect(await Effect.runPromise(runtime.run(explicit.toQuery().build(), undefined))).toEqual(
      await Effect.runPromise(runtime.run(lowered.toQuery().build(), undefined)),
    );
    expect(explicit.toAst()).not.toEqual(lowered.toAst());
    expect(explicit.expression.kind).toBe('references');
    expect(lowered.expression.kind).toBe('predicate');
  });

  it('keeps canonical identity when an alias moves to a different Entity', async () => {
    const rows = makeRows();
    const runtime = runtimeFor(rows);
    const cache = createGraphClientCache();
    const identity = createEntityIdentityRef(Customer, rows[0]!)!;
    const alias = createEntityRef(Customer, { slug: 'first' });
    cache.writeEntity(Customer, rows[0]!);
    expect(cache.resolveEntityRef(alias)).toEqual(identity);
    expect(entityRefsEqual(alias, identity)).toBe(false);
    rows[0] = { ...rows[0]!, slug: 'renamed' };
    rows[1] = { ...rows[1]!, slug: 'first' };
    cache.invalidateEntity(identity);
    cache.writeEntity(Customer, rows[0]);
    cache.writeEntity(Customer, rows[1]);
    expect(createEntityIdentityRef(Customer, rows[0])).toEqual(identity);
    expect(cache.resolveEntityRef(alias)).toEqual(createEntityRef(Customer, { id: 'c2' }));
    const read = (ref: EntityRef<typeof Customer.name>) =>
      Effect.runPromise(
        runtime.run(Selection.references(Customer, [ref]).toQuery().build(), undefined),
      );
    expect((await read(alias)).map(row => row.id)).toEqual(['c2']);
    expect((await read(identity)).map(row => row.id)).toEqual(['c1']);
  });

  it('retains composite canonical identity independently of lookup alternatives', () => {
    const Account = entity('ResearchAccount', {
      tenant: field.string(),
      number: field.string(),
      email: field.string(),
    })
      .locators({ identity: ['tenant', 'number'], byEmail: 'email' })
      .identity('identity');
    const row = { tenant: 't1', number: '42', email: 'a@x.test' };
    const cache = createGraphClientCache();
    const identity = createEntityIdentityRef(Account, row);
    expect(identity).toEqual(createEntityRef(Account, { tenant: 't1', number: '42' }));
    expect(cache.writeEntity(Account, row)?.ref).toEqual(identity);
    expect(createEntityIdentityRef(Account, { number: '42' })).toBeUndefined();
    expect(() => lowerEntityReferenceValue(field.ref(Account), identity)).toThrow(
      'single-field identity',
    );
  });

  it.each(['missing@x.test', 'shared@x.test'])(
    'enforces consumer one cardinality for %s without changing membership',
    async email => {
      const rows = makeRows().map(row => ({ ...row, loginEmail: 'shared@x.test' }));
      const selected = expandFixture({ loginEmail: email });
      const parsed = safeParseGraphSchema(graphSchema.object({ customer: Customer.one() }), {
        customer: selected.toAst(),
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw new Error('Expected valid Selection input.');
      if (!(parsed.data.customer instanceof Selection))
        throw new Error('Expected rehydrated Selection.');
      expect(parsed.data.customer.cardinality).toBe('one');
      expect(parsed.data.customer.toAst()).toEqual(selected.toAst());
      const runtime = runtimeFor(rows);
      await expect(
        Effect.runPromise(runtime.run(parsed.data.customer.toQuery().build(), undefined)),
      ).rejects.toThrow('Expected exactly one');
      const before = structuredClone(rows);
      await expect(
        Effect.runPromise(
          runtime.runCommand(parsed.data.customer.update({ slug: 'changed' }).build()),
        ),
      ).rejects.toThrow();
      expect(rows).toEqual(before);
    },
  );

  it('still authorizes expanded Fields at the receiver, rather than trusting a factory name', async () => {
    const execute = vi.fn();
    const dispatch = createGraphReadDispatcher({
      policies: [
        {
          entity: Customer,
          modes: ['run'],
          cardinalities: ['many'],
          maxLimit: 25,
          scope: 'all',
          fields: {
            id: { select: true },
            slug: { select: true },
            loginEmail: { select: true },
            billingEmail: { select: true },
            archivedAt: { select: true },
          },
        },
      ],
      execute,
    });
    const request = toGraphReadRequest(expandFixture({ loginEmail: 'a@x.test' }).toQuery(), 'run');
    expect(await dispatch(request, { authority: undefined })).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('intersects expanded membership with receiver scope using the real read dispatcher', async () => {
    const runtime = runtimeFor();
    const dispatch = createGraphReadDispatcher({
      policies: [
        {
          entity: Customer,
          modes: ['run'],
          cardinalities: ['many'],
          maxLimit: 25,
          scope: () => ({ kind: 'predicate', fieldName: 'id', operator: 'eq', value: 'c1' }),
          fields: {
            id: { select: true },
            slug: { select: true },
            loginEmail: { select: true },
            billingEmail: { select: true },
            archivedAt: { select: true, filter: ['gte'] },
          },
        },
      ],
      execute: spec => Effect.runPromise(runtime.run(spec, undefined)),
    });
    const selected = expandFixture({ archivedSince: { date: '2025-01-01T00:00:00Z' } });
    expect(
      await dispatch(toGraphReadRequest(selected.toQuery().limit(25), 'run'), {
        authority: undefined,
      }),
    ).toEqual({
      kind: 'graph-read-result',
      value: [makeRows()[0]],
    });
  });

  it('does not treat a limited row as proof of unique selection membership (150a regression)', async () => {
    const runtime = runtimeFor();
    const selected = new Selection(Customer, Selection.all(Customer).expression, undefined, 'one');
    await expect(
      Effect.runPromise(runtime.run(selected.toQuery().build(), undefined)),
    ).rejects.toThrow('Expected exactly one');
    // 150a originally characterized this as a false success; 116a fixes that boundary.
    await expect(
      Effect.runPromise(runtime.run(selected.toQuery().limit(1).build(), undefined)),
    ).rejects.toThrow('Expected exactly one');
    expect(selected.cardinality).toBe('one');
  });

  it('does not interpret an external-lookup payload as a currently supported Ref or Command', async () => {
    const ref = createEntityRef(Customer, { supportTicket: { ticketNumber: 'SUP-123' } });
    expect(
      safeParseGraphSchema(Customer.one(), Selection.references(Customer, [ref]).toAst()).success,
    ).toBe(false);
    const executeEntityMutation = vi.fn();
    const dispatch = createGraphCommandDispatcher({
      policies: [
        {
          entity: Customer,
          scope: 'all',
          actions: { update: { fields: ['slug'], result: ['id', 'slug'] } },
        },
      ],
      executeEntityMutation,
    });
    expect(
      await dispatch(toGraphCommandRequest(mutateEntity(Customer).update(ref, { slug: 'x' })), {
        authority: undefined,
      }),
    ).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'invalid_reference' },
    });
    expect(executeEntityMutation).not.toHaveBeenCalled();
  });

  it('requires canonical identity for stored reference values, not an alternate criterion', () => {
    const customerField = field.ref(Customer);
    expect(lowerEntityReferenceValue(customerField, createEntityRef(Customer, { id: 'c1' }))).toBe(
      'c1',
    );
    expect(() =>
      lowerEntityReferenceValue(customerField, createEntityRef(Customer, { slug: 'first' })),
    ).toThrow('required');
  });

  it('shows why current exact-Command reconciliation cannot silently replace an alias with identity', () => {
    const row = makeRows()[0]!;
    const target = createEntityRef(Customer, { slug: row.slug });
    const command = mutateEntity(Customer).update(target, { loginEmail: 'new@x.test' });
    const delta = {
      created: [],
      deleted: [],
      updated: [{ entityName: Customer.name, ref: target, values: row }],
    };
    expect(isExactEntityMutationDelta(delta, command)).toBe(true);
    expect(
      isExactEntityMutationDelta(
        {
          ...delta,
          updated: [{ ...delta.updated[0]!, ref: createEntityIdentityRef(Customer, row)! }],
        },
        command,
      ),
    ).toBe(false);
    expect(toGraphCommandRequest(command)).not.toHaveProperty('selection');
    expect(
      query(Customer)
        .where(
          new Selection(
            Customer,
            lowerSelectionReferences(Selection.references(Customer, [target]).expression),
          ),
        )
        .build().selection,
    ).toEqual({
      kind: 'predicate',
      fieldName: 'slug',
      operator: 'eq',
      value: row.slug,
    });
  });
});
