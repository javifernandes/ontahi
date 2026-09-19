---
'@ontahi/postgres': patch
---

Restrict PostgreSQL `SELECT` lists to caller-selected Fields plus the internal join keys required
for Relations, avoiding transfer of unselected wide columns while preserving public result shapes.
