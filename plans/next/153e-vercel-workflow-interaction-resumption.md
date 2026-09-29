# 153e. Vercel Workflow Interaction Resumption

Status: next

Canonical ID: `ontahi://plans/153e-vercel-workflow-interaction-resumption`

Parent: [153c. Interactive And Resumable Operation Execution](../current/153c-operation-interactions-and-resumption.md)

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

- [ ] The existing explicit Todo Operation runs unchanged through Vercel Workflow.
- [ ] Choice and approval survive process and deployment boundaries.
- [ ] A valid response continues exactly one execution attempt.
- [ ] Runtime and workflow identities remain distinct and inspectable.
- [ ] Vercel-specific events and handles remain inside the adapter package.
