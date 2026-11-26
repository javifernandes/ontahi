# Durable Operation conformance

Durable Operation guarantees apply to a configured executor, Task Storage, and Event Runtime.
Reflection describes declared contracts and runtime capabilities. Conformance passes are evidence
from a particular configuration.

| Guarantee                              | Executable case                                                                                                                        | PostgreSQL worker | Vercel Workflow                                                         | LangGraph                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| Atomic admission                       | `atomic-admission` races equivalent starts and checks both policies after completion.                                                  | Covered           | Controlled SDK pass                                                     | Pending shared run                          |
| Approval and checkpoint recovery       | `approval-resumption` persists an approval wait and resumes the same Task through a new host.                                          | Covered           | Controlled SDK pass and Local World restart proof                       | Pending shared run                          |
| Retained Event and duplicate callbacks | `retained-event-resumption` retains a matching Event while the worker is offline and verifies one continuation across competing hosts. | Covered           | Controlled SDK pass                                                     | Event waits rejected by the current adapter |
| Ordered observation                    | `ordered-observation` subscribes before executing and checks the lifecycle across host recreation.                                     | Covered           | Controlled SDK pass with ordered Task storage                           | Pending shared run                          |
| Expired claim fencing                  | `expired-claim-fencing` recovers while the earlier attempt is held and proves its stale result cannot overwrite the new result.        | Covered           | Adapter does not expose claim fencing                                   | Pending shared run                          |
| Running cancellation                   | `running-cancellation` revokes the claim, checks the terminal state, and preserves ambiguous admission.                                | Covered           | Controlled SDK pass with conditional Task storage                       | Pending shared run                          |
| External-effect reconciliation         | Seven cases check recovery, authoritative absence, ambiguous outcomes, and restart after a lost response.                              | Covered           | Six controlled SDK cases pass. In-flight restart passes in Local World. | Pending shared run                          |

Use `durableOperationConformanceCases` and `verifyDurableOperationConformance` from
`@ontahi/core/runtime/server/tasks`. Register each case as its own test with isolated persistent
state. The harness opens independent hosts against that state and drives the real executor to its
next persisted boundary. Supply Event publishing, claim expiry, or cancellation only for the
cases that use those capabilities. Run the existing `taskReconciliationCases` with
`verifyTaskReconciliationConformance` for the external-effect group.

A case that was not run has no conformance result. A configuration that rejects a feature can
record that behavior explicitly. The suite measures durable Task continuation. A provider
request already in flight can still commit after cancellation or lease loss and needs its own
idempotency or reconciliation contract.

The PostgreSQL Task integration suite is the first persistent reference. The in-memory fixture
also exercises admission and approval through independent runtime instances sharing memory.
Lease renewal, timed scheduling, replacement, and queueing are follow-up guarantees.

The Vercel tests execute the actual Ontahí runtime and executor with a controlled Workflow SDK
and in-memory fixture stores. They verify adapter behavior at the SDK boundary. Recovery after a crash between Task admission and Workflow submission remains unverified. An ambiguous submission retains the admission key for reconciliation.

Vercel uses `observeSnapshots` for ordered observation and `updateIfStatus` for fenced
cancellation. PostgreSQL Task Storage supplies both when the updated Task schema is applied.
The PostgreSQL integration tests also exercise journal order and a rejected late write for a
Vercel-tagged run. The existing Event-wait cancellation path owns subscription cleanup.

### Vercel Workflow worker crash

The Local World integration test compiles real Workflow DevKit handlers and runs them in a
separate Node process. It waits for both a persisted Ontahí checkpoint and a registered Workflow
hook, kills the process with `SIGKILL`, and starts a new process using the same storage
directories. Resuming the original hook completes the original Workflow run and Ontahí Task run.
The result identifies both processes, and the fixture fails if the original checkpoint-writing
step replays or if the executor initializes a fresh Task state.

Run the proof after building Core and the Vercel adapter.

```sh
pnpm --filter @ontahi/core build
pnpm --filter @ontahi/runtime-vercel-workflows build
pnpm --filter @ontahi/runtime-vercel-workflows test src/worker-restart.integration.test.ts
```

A second case resumes the hook before killing the worker. An independent HTTP provider commits
the customer and keeps the response open. The restarted Local World retries the interrupted
Workflow step. The Ontahí executor reads the prepared effect from its checkpoint, recovers the
customer by external reference, and completes the original run with one provider write.

Both adapter proofs use actual Workflow DevKit processes and the Local World backend.

A synthetic probe on the managed Vercel backend persisted a Workflow step result and killed the
Node process with `SIGKILL` in the following step. Vercel recorded the process exit, then the
original Workflow run completed on attempt 2 with the persisted checkpoint. The hosted probe
exercises the Workflow engine and its managed backend. The adapter and HTTP provider are exercised
by the Local World tests above.
