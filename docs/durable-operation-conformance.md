# Durable Operation conformance

Durable Operation guarantees apply to a configured executor, Task Storage, and Event Runtime.
Reflection describes declared contracts and runtime capabilities. Conformance passes are evidence
from a particular configuration.

| Guarantee                              | Executable case                                                                                                                        | PostgreSQL worker | Vercel Workflow                                                         | LangGraph                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Atomic admission                       | `atomic-admission` races equivalent starts and checks both policies after completion.                                                  | Covered           | Controlled SDK pass                                                     | Shared case passes with atomic Task Storage.                                        |
| Approval and checkpoint recovery       | `approval-resumption` persists an approval wait and resumes the same Task through a new host.                                          | Covered           | Controlled SDK pass and Local World restart proof                       | Shared case passes across runtime instances.                                        |
| Retained Event and duplicate callbacks | `retained-event-resumption` retains a matching Event while the worker is offline and verifies one continuation across competing hosts. | Covered           | Controlled SDK pass                                                     | Shared case passes. PostgreSQL and SQLite pass a worker restart.                    |
| Ordered observation                    | `ordered-observation` subscribes before executing and checks the lifecycle across host recreation.                                     | Covered           | Controlled SDK pass with ordered Task storage                           | Shared case passes with one shared in-memory Task Storage.                          |
| Expired claim fencing                  | `expired-claim-fencing` recovers while the earlier attempt is held and proves its stale result cannot overwrite the new result.        | Covered           | Adapter does not expose claim fencing                                   | A two-host probe verifies takeover and rejects the first worker’s late result.      |
| Running cancellation                   | `running-cancellation` revokes the claim, checks the terminal state, and preserves ambiguous admission.                                | Covered           | Controlled SDK pass with conditional Task storage                       | Two-host test verifies cancellation, late-write fencing, and ambiguous readmission. |
| External-effect reconciliation         | Seven cases check recovery, authoritative absence, ambiguous outcomes, and restart after a lost response.                              | Covered           | Six controlled SDK cases pass. In-flight restart passes in Local World. | All seven shared cases pass, including ambiguous readmission.                       |

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

### LangGraph adapter baseline

The shared cases run the real LangGraph executor with independent runtime instances sharing
one in-memory Task Storage and one LangGraph `MemorySaver`. The observation case exercises
the projection shared by those instances. The existing SQLite test independently reopens
the checkpoint database and resumes an interaction. The reconciliation host-recreation case
starts another runtime while the first attempt is suspended. It does not kill a process.

LangGraph uses atomic Task Storage admission for explicit execution. Equivalent starts share
the admitted run and only the creator launches execution. A failed lookup, an inconclusive
lookup, and a retry whose response times out preserve both `task_effect_outcome_ambiguous`
and the prepared checkpoint. In each case the shared suite starts again with the same key,
checks that the original run reports `reconciliation-required`, and verifies that no
additional provider write occurred.

LangGraph acquires an execution lease when Task Storage provides conditional writes. The
lease defaults to 60 seconds and can be configured with `executionLeaseMs`. A second runtime
can reclaim the same Ontahí run after expiry. It uses a new LangGraph thread so the original
worker cannot replace the recovery worker's provider checkpoints. The new thread starts from
the authoritative Task checkpoint. Conditional writes guard Task progress, checkpoints, and
terminal state against the runtime reference and the lease deadline. The two-host test holds
the first execution, expires its persisted lease, completes from the second worker, and
releases the first to verify that its late result is rejected. A PostgreSQL test checks the
storage predicate before and after takeover.

Active-run cancellation atomically revokes the lease and records a terminal Task snapshot.
The held-worker test verifies that its late result is discarded and that a repeat of the
admission key returns the cancelled run with `reconciliation-required`. Cancellation before
execution starts leaves the admission key available for another run. A call already in flight
can still have external effects.

A live worker renews its lease about every third of the configured duration while the graph
invocation is active. Renewal uses the same storage fence as execution writes and stops when
the invocation settles or the lease is lost. A held-step test crosses the original deadline,
checks that the owner is unchanged, and verifies that a competing runtime does not execute
the checkpoint.

LangGraph persists Event waits in Task Storage and uses the configured durable Event Runtime
for retained delivery. Snapshot reads and active observation drive polling. On a match,
Task Storage claims the waiting checkpoint atomically. The worker settles the retained
delivery before resuming from the claimed checkpoint under its execution lease. The shared
case accepts a matching callback while no host is polling and verifies one continuation
even when two hosts compete and a duplicate callback is present. Adapter tests also cover
observation, cancellation, and timeout.

Storage without conditional writes retains the original execution behavior and does not
support LangGraph Event waits or active-run cancellation.

The process-restart test uses PostgreSQL for both Task Storage and retained Event delivery,
and a file-backed SQLite saver for LangGraph. It kills the first worker with `SIGKILL`
after the wait and provider checkpoint are durable. It then ingests an unrelated callback
and two matching callbacks while the worker is down. A second process reopens the SQLite
checkpoint, completes the original Task run, and records exactly one continuation in a
PostgreSQL audit table.

Run the suite after building the workspace packages. The restart test starts a disposable
PostgreSQL container by default and also accepts `ONTAHI_POSTGRES_TEST_URL`.

```sh
pnpm --filter @ontahi/runtime-langgraph rebuild better-sqlite3
pnpm --filter @ontahi/runtime-langgraph... build
pnpm --filter @ontahi/runtime-langgraph test
```
