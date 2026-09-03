# 130a. Durable Principal Propagation

Status: backlog

Canonical ID: `ontahi://plans/130a-durable-principal-propagation`

Migrated from: `bookops://plans/130a-durable-principal-propagation`
Original path: `plans/backlog/follow-up/130a-durable-principal-propagation.md`
Source commit: `f9e32aed`

Source plan: [`130. Ontahi Authentication Principal And Invocation Context`](../../done/130-ontahi-authentication-principal-and-invocation-context.md)

## Summary

Define how caller identity is captured when a durable operation crosses process and time boundaries.
The durable value must preserve the minimum auditable Principal without serializing provider users,
sessions, cookies, or access tokens.

## Scope

1. Decide whether a task captures its triggering Principal, a delegated service Principal, or both.
2. Version and serialize the durable actor value explicitly.
3. Re-establish invocation context in a worker before requirements and operation code run.
4. Preserve auditability while allowing provider credentials to expire independently.

## Non-Goals

1. Do not serialize Passport or Supabase user objects.
2. Do not make a captured Principal an authorization decision valid forever.

## Proposed Form

```ts
await TodoImport.start(input, {
  trigger: { kind: 'user', principal: app.auth.requirePrincipal() },
});
```

The worker restores the Principal as invocation context, then evaluates current authorization and
resource state rather than trusting a historical permission decision.

## Acceptance Checklist

- [ ] Durable task metadata carries a versioned, provider-neutral actor.
- [ ] Workers restore that actor into the invocation context.
- [ ] Provider sessions and tokens never enter durable payloads.
- [ ] Tests distinguish captured identity from current authorization.
