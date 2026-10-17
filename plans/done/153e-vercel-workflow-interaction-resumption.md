# 153e. Vercel Workflow Interaction Resumption

Status: done

Canonical ID: `ontahi://plans/153e-vercel-workflow-interaction-resumption`

Parent: [153c. Interactive And Resumable Operation Execution](./153c-operation-interactions-and-resumption.md)

Shapes: [Operation Interaction](../../atlas/items/model/operation-interaction.md),
[Durable Operation](../../atlas/items/model/durable-operation.md).

## Goal

Close the current Vercel Workflow Task Runtime gap for explicit executions, choice, approval, and
resume. Reuse the semantic execution driver and evidence produced by the native/LangGraph
comparison rather than defining provider-specific Interaction contracts.

## Direction

Evaluate both provider mappings before choosing one:

1. translate an Ontahí Interaction into a native durable wait/event and resume the same workflow;
2. end the current workflow invocation at the Interaction, persist the Ontahí checkpoint, and start
   a new workflow invocation when a valid response is atomically claimed.

The selected mapping must preserve the Task Run identity, actor authorization, exact approval
proposal, duplicate-response protection, Runtime Protocol observation, and normal Operation output.

## Acceptance

- [x] The existing explicit Todo Operation runs unchanged through Vercel Workflow.
- [x] Choice and approval survive process and deployment boundaries.
- [x] A valid response continues exactly one execution attempt.
- [x] Runtime and workflow identities remain distinct and inspectable.
- [x] Vercel-specific events and handles remain inside the adapter package.

## Decision and closure

The adapter uses native Vercel Workflow hooks rather than ending and restarting workflow runs.
Before publishing an Ontahi `waiting` checkpoint, the executor registers a deterministic,
adapter-private hook and confirms that no other workflow owns it. A response is authorized and
validated against the canonical pending Interaction, atomically claimed in Task Storage, and only
the claim winner may resume the hook. The original Task Run and Vercel workflow run therefore keep
their distinct identities throughout choice and approval boundaries.

The Todo `deleteFromNamedList` execution supplied the unchanged semantic shape exercised here:
choice, exact proposal approval, and continuation to its ordinary result. Legacy imperative
`context.interact.*` calls remain on their explicit compatibility failure path. Durable Event waits
remain a separate provider capability and are not part of this plan.

Verification covers runtime recreation, exact proposal persistence, duplicate and concurrent
responses, actor authorization, invalid responses, native hook conflicts, resume failure, normal
completion, and the deliberately unsupported Event-wait boundary.
