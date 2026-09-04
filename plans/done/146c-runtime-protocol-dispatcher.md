# 146c. Runtime Protocol Dispatcher

Status: done

Parent plan: [146. Ontahí Runtime Protocol](./146-ontahi-runtime-protocol.md)

Predecessor:
[146b. Versioned Operation Protocol Family](../done/146b-versioned-operation-protocol-family.md)

Canonical ID: `ontahi://plans/146c-runtime-protocol-dispatcher`

## Summary

Add one transport-neutral Core dispatcher for the currently registered Runtime Protocol families:
`operation`, `graph.read`, and `graph.command`. The dispatcher validates the common envelope and
family body, routes the canonical body to the existing family dispatcher, and wraps its complete
result in a correlated Runtime Protocol response.

```ts
const dispatch = createRuntimeProtocolDispatcher({
  handlers: {
    operation: operationDispatcher,
    'graph.read': graphReadDispatcher,
    'graph.command': graphCommandDispatcher,
  },
});

const response = await dispatch(request, { authority });
```

The common dispatcher does not reinterpret Operation failures, Graph Read errors, Graph Command
rejections, or family-specific protocol errors. Those remain complete response bodies owned by
their existing dispatchers. Core owns only envelope validation, routing, correlation, capability
absence, safe execution failure, and response portability at this boundary.

## Current Evidence

1. `runtimeProtocolFamilies` now registers versioned parsers for `operation`, `graph.read`, and
   `graph.command`.
2. `createOperationInvocationDispatcher`, `createGraphReadDispatcher`, and
   `createGraphCommandDispatcher` already own model resolution, authorization, policy, and
   execution for their respective families.
3. Operation dispatchers need only the canonical body; Graph dispatchers also consume a
   receiver-owned context containing authority. A shared handler signature can pass one opaque
   context while allowing a handler to ignore or adapt it.
4. A runtime is not required to implement every registered family. A known family without a local
   handler is different from an unknown protocol family.
5. Existing HTTP adapters parse and dispatch each family separately. They remain unchanged until a
   later Express/Fetch slice projects this dispatcher onto the default `/runtime` path.

## Scope

1. Define a typed Core handler map derived from the canonical family registry.
2. Accept unknown input plus a receiver-owned context and validate it through the existing Runtime
   Protocol registry before family execution.
3. Route each canonical family body to its configured handler without reimplementing family
   parsing, authorization, policy, or execution.
4. Preserve request id and family in every successful response envelope.
5. Keep family-specific results, rejections, and errors inside the response body unchanged.
6. Distinguish an unknown family, a known but unavailable family, a failed handler, and a handler
   that returns a non-portable response.
7. Report unexpected handler or response failures without leaking their causes into the portable
   protocol response.
8. Add semantic routing, failure, portability, and public type tests.
9. Update Plan 146, Atlas, developer documentation, and add a Core Changeset.

## Non-Goals

1. No Express `/runtime` path, Fetch transport migration, endpoint compatibility work, or status
   code mapping.
2. No Durable Operation inspect/progress/cancel/result family; starting one remains an ordinary
   `operation` invocation.
3. No capability negotiation document beyond the observable known-but-unavailable family result.
4. No new authorization or policy representation and no authority authored into portable data.
5. No generic middleware, retry, batching, streaming, WebSocket, gRPC, CLI, or Event support.
6. No flattening of family response bodies into a universal success/failure algebra.

## Acceptance Checklist

- [x] All three canonical families route through one dispatcher and receive their canonical body.
- [x] Receiver-owned context reaches the selected handler and never enters the portable envelope.
- [x] Malformed envelopes and family bodies fail before any handler executes.
- [x] Unknown and known-but-unavailable families remain distinguishable.
- [x] Family results, semantic rejections, and family protocol errors remain unchanged inside the
      correlated response body.
- [x] Handler throws and non-JSON responses produce safe, correlated common protocol errors.
- [x] Handler failures can be reported with the canonical request without leaking private causes.
- [x] Unknown or malformed handler registrations fail during dispatcher construction.
- [x] Existing HTTP adapters and family dispatchers remain unchanged.
- [x] Focused/full Core tests, coverage, typecheck, lint, formatting, build, artifact verification,
      and Changeset status pass.
- [x] Plan 146, Atlas, and developer documentation record the dispatcher boundary and remaining
      Durable lifecycle gap.

## Delivery Evidence

1. `@ontahi/core/runtime/protocol` publishes a typed dispatcher whose optional handler keys are
   derived from the canonical `operation`, `graph.read`, and `graph.command` registry.
2. The dispatcher validates through the existing family parsers, passes receiver context beside
   the canonical body, and wraps successful handler output with exact request id/family
   correlation.
3. Existing Operation, Graph Read, and Graph Command dispatcher types plug into the handler map
   directly when they share a context; family authorization and execution remain untouched.
4. `family_unavailable`, `dispatch_unavailable`, and `invalid_response` distinguish runtime
   capability absence, safe execution failure, and a non-portable handler result from an unknown
   family or invalid request.
5. Semantic tests cover every registered route, pre-execution rejection, response preservation,
   error reporting, JSON safety, registration validation, and public type compatibility. Full Core
   coverage reports 100% statements/functions/lines and 97.9% branches for `runtime/protocol`.
6. Core coverage, typecheck, lint, formatting, package builds, Changeset status, and clean-room
   artifact install/type/runtime verification pass. Atlas and developer documentation record the
   transport-neutral boundary; HTTP migration and Durable lifecycle remain later slices.
