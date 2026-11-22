# Decisions

| ID | Status | Decision | Basis |
| --- | --- | --- | --- |
| D001 | Accepted by owner request | Use pavlospetrides/trustpay- for shared tasks, plans, architecture, code and handoffs | Repository setup request, 23 November 2026 |
| D002 | Bootstrap convention applied | Initial main commit, then task branches and human-reviewed PRs | Empty repository observed during setup; subsequent work uses PRs |
| D003 | Existing team direction, awaiting code verification | Import the reported FastAPI/SQLite MVP before adding framework scaffolds | TrustPay project brief supplied by the team |
| D004 | Proposed | Keep existing SQLite initially; evaluate PostgreSQL/Supabase after import | Avoid migration assumptions before inspecting the source |

Add a row with date, responsible decision-maker, reason and issue/PR link when the team accepts a substantive choice. Retain superseded decisions with a pointer to the replacement. Record implementation evidence separately from approval.
