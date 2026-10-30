---
'@ontahi/runtime-http': minor
'@ontahi/runtime-express': patch
'@ontahi/runtime-nextjs': patch
'@ontahi/postgres': patch
---

Add framework-neutral Operation and Event ingress composition plus a minimal bounded `node:http`
host to `@ontahi/runtime-http`. Express and Next.js now reuse the same handler, and PostgreSQL proves
durable signed HTTP Event egress across retry, runtime recreation, and final acknowledgement.
