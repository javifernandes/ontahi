import { Effect } from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { entity as serverEntity, ontahi } from '../runtime/server/index.js';

import {
  createEntityIdentityRef,
  createGraphReadDispatcher,
  createInMemoryDataGraphRuntime,
  createInMemoryDataGraphStorage,
  defineClientEntity,
  entity,
  field,
  graphSchema,
  safeParseGraphSchema,
  Selection,
  toGraphReadRequest,
  withSelectionFactories,
  type SelectionFactoryDeclaration,
} from './index.js';

const declareCustomer = () =>
  withSelectionFactories(
    entity('Customer', {
      id: field.id(),
      email: field.string(),
      billingEmail: field.string(),
      archivedAt: field.datetime(),
      tenant: field.string(),
      enabled: field.boolean(),
    }).locators({ refByEmail: 'email' }),
    {
      identity: {
        version: 1,
        input: graphSchema.object({ id: field.id() }),
        scalarInput: 'id',
        template: { kind: 'identity', bindings: { id: 'id' } },
      },
      loginEmail: {
        version: 1,
        input: graphSchema.object({ email: field.string() }),
        scalarInput: 'email',
        template: { kind: 'predicate', fieldName: 'email', operator: 'eq', input: 'email' },
      },
      billingEmail: {
        version: 1,
        input: graphSchema.object({ email: field.string() }),
        template: { kind: 'predicate', fieldName: 'billingEmail', operator: 'eq', input: 'email' },
      },
      archivedSince: {
        version: 1,
        input: graphSchema.object({ date: field.datetime() }),
        template: { kind: 'predicate', fieldName: 'archivedAt', operator: 'gte', input: 'date' },
      },
    },
  );

const makeRows = () => [
  {
    id: 'c1',
    email: 'a@x.test',
    billingEmail: 'b@x.test',
    archivedAt: '2026-08-01T00:00:00Z',
    tenant: 't1',
    enabled: true,
  },
  {
    id: 'c2',
    email: 'b@x.test',
    billingEmail: 'a@x.test',
    archivedAt: '2026-08-01T00:00:00Z',
    tenant: 't2',
    enabled: true,
  },
];

describe('pure named Selection factories', () => {
  it.each([0, 1, 2])('binds a real exact-one Operation with %i matching members', async count => {
    const CustomerDefinition = serverEntity({
      name: 'Customer',
      fields: { id: field.id(), enabled: field.boolean() },
      operations: ({ self, operation }) => ({
        disable: operation({
          input: graphSchema.object({ customer: self.one() }),
          output: self,
          run: ({ customer }) => customer.updateReturning({ enabled: false }, ['id', 'enabled']),
        }),
      }),
    });
    const Customer = withSelectionFactories(CustomerDefinition, {
      identity: {
        version: 1,
        input: graphSchema.object({ id: field.id() }),
        scalarInput: 'id',
        template: { kind: 'identity', bindings: { id: 'id' } },
      },
      enabled: {
        version: 1,
        input: graphSchema.object({ flag: field.boolean() }),
        scalarInput: 'flag',
        template: { kind: 'predicate', fieldName: 'enabled', operator: 'eq', input: 'flag' },
      },
    });
    const dataset = {
      Customer: Array.from({ length: count }, (_, index) => ({
        id: `c${index + 1}`,
        enabled: true,
      })),
    };
    const before = structuredClone(dataset);
    const application = ontahi({
      storage: createInMemoryDataGraphStorage({ dataset }),
      entities: [Customer],
    });
    const discovered = JSON.parse(JSON.stringify(application.graph.describe()));
    expect(discovered.entities[0].selectionFactories.identity).toMatchObject({
      input: { kind: 'object', unknownKeys: 'strict' },
      output: { kind: 'selection', entityName: 'Customer' },
    });
    expect(discovered.entities[0].selectionFactories.identity.output).not.toHaveProperty(
      'cardinality',
    );
    const chosen = count === 1 ? Customer.by({ identity: 'c1' }) : Customer.by({ enabled: true });
    expect(dataset).toEqual(before);
    if (count !== 1) {
      await expect(Customer.disable({ customer: chosen })).resolves.toMatchObject({ ok: false });
      expect(dataset).toEqual(before);
      expect(chosen.cardinality).toBeUndefined();
      return;
    }
    await expect(Customer.disable({ customer: chosen })).resolves.toMatchObject({
      ok: true,
      value: { id: 'c1', enabled: false },
    });
    expect(dataset.Customer[0]!.enabled).toBe(false);
    expect(chosen.cardinality).toBeUndefined();
  });
  it('keeps by and legacy locators side by side, with canonical explicit identity', () => {
    const Customer = declareCustomer();
    const client = defineClientEntity(Customer);
    const selected = client.by({ identity: 'c1' });
    expect(selected).toBeInstanceOf(Selection);
    expect(selected.root).toBe(Customer);
    expect(selected.cardinality).toBeUndefined();
    expect(selected.toAst().expression).toEqual({
      kind: 'references',
      refs: [client.refById('c1')],
    });
    expect(createEntityIdentityRef(Customer, makeRows()[0]!)).toEqual(client.refById('c1'));
    expect(client.refByEmail('a@x.test').locator).toEqual({ email: 'a@x.test' });
    expectTypeOf(selected.cardinality).toEqualTypeOf<undefined>();
    type Input = Parameters<typeof Customer.by>[0];
    expectTypeOf<{ loginEmail: string }>().toExtend<Input>();
    expectTypeOf<{ archivedSince: { date: string } }>().toExtend<Input>();
    expectTypeOf<{ loginEmail: number }>().not.toExtend<Input>();
    expectTypeOf<{ billingEmail: string }>().not.toExtend<Input>();
    expectTypeOf<{ identity: string; loginEmail: string }>().not.toExtend<Input>();
    expectTypeOf<{ absent: string }>().not.toExtend<Input>();
  });

  it('reflects declaration and retains invocation separately from the execution AST', () => {
    const Customer = declareCustomer();
    const selected = Customer.by({ archivedSince: { date: '2026-06-01T00:00:00Z' } });
    expect(Customer.fields).not.toHaveProperty('date');
    expect(Customer.selectionFactories.archivedSince).toMatchObject({
      version: 1,
      input: { kind: 'object', fields: { date: { kind: 'scalar', type: 'string' } } },
      template: { kind: 'predicate', fieldName: 'archivedAt', operator: 'gte', input: 'date' },
    });
    expect(JSON.parse(JSON.stringify(Customer.selectionFactories))).toEqual(
      Customer.selectionFactories,
    );
    expect(selected.factoryInvocation).toEqual({
      entityName: 'Customer',
      name: 'archivedSince',
      version: 1,
      input: { date: '2026-06-01T00:00:00Z' },
    });
    expect(selected.toAst()).toEqual({
      kind: 'selection',
      entityName: 'Customer',
      expression: {
        kind: 'predicate',
        fieldName: 'archivedAt',
        operator: 'gte',
        value: '2026-06-01T00:00:00Z',
      },
    });
    expect(JSON.parse(JSON.stringify(selected))).toEqual(selected.toAst());
    expect(selected.and(c => c.enabled.eq(true))).not.toHaveProperty('factoryInvocation');
  });

  it('normalizes explicit shorthand and distinguishes factories with identical input shapes', async () => {
    const Customer = declareCustomer();
    const runtime = createInMemoryDataGraphRuntime({
      entities: [Customer],
      dataset: { Customer: makeRows() },
    });
    const login = Customer.by({ loginEmail: 'a@x.test' });
    expect(Customer.by({ loginEmail: { email: 'a@x.test' } }).toAst()).toEqual(login.toAst());
    const billing = Customer.by({ billingEmail: { email: 'a@x.test' } });
    expect(Customer.selectionFactories.loginEmail.input).toEqual(
      Customer.selectionFactories.billingEmail.input,
    );
    expect(
      (await Effect.runPromise(runtime.run(login.toQuery().build(), undefined))).map(row => row.id),
    ).toEqual(['c1']);
    expect(
      (await Effect.runPromise(runtime.run(billing.toQuery().build(), undefined))).map(
        row => row.id,
      ),
    ).toEqual(['c2']);
  });

  it.each<Record<string, unknown>>([
    {},
    { unknown: 'x' },
    { constructor: 'x' },
    { loginEmail: 42 },
    { loginEmail: 'a', billingEmail: { email: 'b' } },
    { loginEmail: { email: 'a', extra: true } },
    { billingEmail: 'a' },
    { archivedSince: { date: 'not-a-date' } },
  ])('rejects invalid or ambiguous invocation %j', invocation => {
    const Customer = declareCustomer();
    expect(() => Customer.by(invocation as never)).toThrow();
  });

  it('composes across a data bridge and builds an update without fetching rows', async () => {
    const Customer = declareCustomer();
    const rows = makeRows();
    const dataset = { Customer: rows };
    const runtime = createInMemoryDataGraphRuntime({ entities: [Customer], dataset });
    const reads = vi.spyOn(runtime, 'run');
    const caller = Customer.by({ archivedSince: { date: '2026-06-01T00:00:00Z' } });
    const original = caller.toAst();
    const parsed = safeParseGraphSchema(graphSchema.object({ customers: Customer.many() }), {
      customers: JSON.parse(JSON.stringify(caller)),
    });
    if (!parsed.success) throw new Error('Expected valid Selection input');
    if (!(parsed.data.customers instanceof Selection))
      throw new Error('Expected hydrated Selection');
    const constrained = parsed.data.customers.and(c => c.tenant.eq('t1'));
    const command = constrained.update({ enabled: false });
    expect(reads).not.toHaveBeenCalled();
    expect(rows.every(row => row.enabled)).toBe(true);
    expect(caller.toAst()).toEqual(original);
    await Effect.runPromise(runtime.runCommand(command.build()));
    expect(reads).not.toHaveBeenCalled();
    expect(dataset.Customer.map(row => row.enabled)).toEqual([false, true]);
  });

  it.each(['missing', 'duplicate'])(
    'lets the consumer enforce exact-one atomically: %s',
    async scenario => {
      const Customer = declareCustomer();
      const rows = makeRows().map(row => ({ ...row, email: 'shared' }));
      const dataset = { Customer: rows };
      const before = structuredClone(dataset);
      const runtime = createInMemoryDataGraphRuntime({ entities: [Customer], dataset });
      const caller = Customer.by({ loginEmail: scenario === 'missing' ? 'absent' : 'shared' });
      const parsed = safeParseGraphSchema(Customer.one(), caller.toAst());
      if (!parsed.success) throw new Error('Expected valid Selection input');
      if (!(parsed.data instanceof Selection)) throw new Error('Expected hydrated Selection');
      expect(parsed.data.cardinality).toBe('one');
      expect(parsed.data.toAst()).toEqual(caller.toAst());
      await expect(
        Effect.runPromise(runtime.runCommand(parsed.data.update({ enabled: false }).build())),
      ).rejects.toThrow();
      expect(dataset).toEqual(before);
    },
  );

  it('does not turn a factory name into a receiver permission grant', async () => {
    const Customer = declareCustomer();
    const execute = vi.fn();
    const dispatch = createGraphReadDispatcher({
      policies: [
        {
          entity: Customer,
          scope: 'all',
          modes: ['run'],
          cardinalities: ['many'],
          maxLimit: 25,
          fields: {
            id: { select: true },
            email: { select: true },
            billingEmail: { select: true },
            archivedAt: { select: true },
            tenant: { select: true },
            enabled: { select: true },
          },
        },
      ],
      execute,
    });
    const request = toGraphReadRequest(
      Customer.by({ loginEmail: 'a@x.test' }).toQuery().limit(25),
      'run',
    );
    expect(await dispatch(request, { authority: undefined })).toMatchObject({
      kind: 'protocol-error',
      error: { code: 'access_denied' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.stringify(request)).not.toContain('loginEmail');
  });

  it('binds composite canonical identity without invoking a legacy resolver', () => {
    const Account = entity('Account', { tenant: field.string(), number: field.string() })
      .locators({ key: ['tenant', 'number'] })
      .identity('key');
    const legacy = vi.fn(Account.refLocators.key);
    Account.refLocators.key = Object.assign(legacy, { fields: ['tenant', 'number'] as const });
    const enhanced = withSelectionFactories(Account, {
      key: {
        version: 1,
        input: graphSchema.object({ workspace: field.string(), account: field.string() }),
        template: { kind: 'identity', bindings: { tenant: 'workspace', number: 'account' } },
      },
    });
    expect(enhanced.by({ key: { workspace: 't1', account: '42' } }).expression).toEqual({
      kind: 'references',
      refs: [
        { kind: 'entity-ref', entityName: 'Account', locator: { tenant: 't1', number: '42' } },
      ],
    });
    expect(legacy).not.toHaveBeenCalled();
  });

  it('owns declaration/reflection/input copies and does not freeze membership at construction', async () => {
    const definition = {
      version: 1,
      input: graphSchema.object({ email: field.string() }),
      template: { kind: 'predicate', fieldName: 'email', operator: 'eq', input: 'email' },
    } satisfies SelectionFactoryDeclaration<'id' | 'email'>;
    const Customer = withSelectionFactories(
      entity('Customer', { id: field.id(), email: field.string() }),
      { email: definition },
    );
    Reflect.set(definition.template, 'fieldName', 'id');
    const descriptor = Customer.selectionFactories.email;
    if (descriptor.template.kind === 'predicate')
      Reflect.set(descriptor.template, 'fieldName', 'id');
    const input = { email: 'a' };
    const selected = Customer.by({ email: input });
    input.email = 'b';
    const invocation = selected.factoryInvocation;
    Reflect.set(invocation.input, 'email', 'b');
    expect(selected.factoryInvocation.input).toEqual({ email: 'a' });
    expect(selected.expression).toEqual({
      kind: 'predicate',
      fieldName: 'email',
      operator: 'eq',
      value: 'a',
    });
    const dataset = { Customer: [{ id: 'c1', email: 'a' }] };
    const runtime = createInMemoryDataGraphRuntime({ entities: [Customer], dataset });
    dataset.Customer.push({ id: 'c2', email: 'a' });
    expect(await Effect.runPromise(runtime.count(selected.toQuery().build(), undefined))).toBe(2);
  });

  it.each([
    { version: 0 },
    { scalarInput: 'missing' },
    { template: { kind: 'predicate', fieldName: 'absent', operator: 'eq', input: 'value' } },
    { template: { kind: 'predicate', fieldName: 'id', operator: 'eq', input: 'absent' } },
    { template: { kind: 'predicate', fieldName: 'id', operator: 'unknown', input: 'value' } },
    { template: { kind: 'identity', bindings: { email: 'value' } } },
    { template: { kind: 'identity', bindings: { id: 'missing' } } },
    { template: { kind: 'external' } },
    { input: graphSchema.object({ value: field.json() }) },
    { input: graphSchema.object({}) },
    { input: graphSchema.object({ value: field.optional(field.string()) }) },
    { input: field.string() },
  ])('rejects unsupported declarations before attaching by: %j', override => {
    const Customer = entity('Customer', { id: field.id(), email: field.string() });
    const definition = {
      version: 1,
      input: graphSchema.object({ value: field.string() }),
      template: { kind: 'predicate', fieldName: 'id', operator: 'eq', input: 'value' },
      ...override,
    };
    expect(() => withSelectionFactories(Customer, { invalid: definition } as never)).toThrow();
    expect(Customer).not.toHaveProperty('by');
  });

  it('validates expanded values against the target Entity and rejects double registration', () => {
    const Customer = withSelectionFactories(entity('Customer', { id: field.id() }), {
      bad: {
        version: 1,
        input: graphSchema.object({ value: field.number() }),
        template: { kind: 'predicate', fieldName: 'id', operator: 'eq', input: 'value' },
      },
    });
    expect(() => Customer.by({ bad: { value: 1 } })).toThrow();
    expect(() => withSelectionFactories(Customer, {})).toThrow('already defined');
  });

  it('rejects a legacy by method collision rather than overriding either meaning', () => {
    const Legacy = entity('Legacy', { id: field.id() }).locators({ by: 'id' });
    expect(() => withSelectionFactories(Legacy, {})).toThrow('conflicts');
    expect(defineClientEntity(Legacy).by('one').locator).toEqual({ id: 'one' });
    const Customer = declareCustomer();
    const client = defineClientEntity(Customer);
    Customer.locators({ by: 'id' });
    expect(() => defineClientEntity(Customer)).toThrow('conflicts');
    expect(client.by({ identity: 'c1' }).expression.kind).toBe('references');
  });
});
