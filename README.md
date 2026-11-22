# TrustPay AI

Know who you're paying. Before you pay.

TrustPay helps finance teams review proposed business payments by flagging supplier account changes, duplicate invoices and unusual amounts, explaining the evidence, and requiring human verification before approval.

## Start here

| Need | Shared location |
| --- | --- |
| Current state and next work | [Team status](docs/STATUS.md) |
| Tasks, ownership and blockers | [GitHub Issues](https://github.com/pavlospetrides/trustpay-/issues) |
| Product and demo scope | [Project brief](docs/PROJECT.md) |
| Proposed components and data flow | [Architecture](docs/ARCHITECTURE.md) |
| Daily collaboration and handoffs | [Contributing](CONTRIBUTING.md) |
| Decisions and open choices | [Decision log](docs/DECISIONS.md) |
| Verification and demo evidence | [Acceptance plan](docs/ACCEPTANCE.md) |
| Start an agent session | [Shared agent guide](AGENTS.md) |

This repository is the shared record for the four-person team at the Bank of Cyprus Fintech Hackathon, 27–29 November 2026. Plans, implementation changes, review outcomes and handoffs belong here. Use synthetic data in public examples.

## Implementation status

The team reports an existing Python/FastAPI/SQLite MVP with a rule-based risk engine. Its source is awaiting import and verification in this repository. Next.js/React UI, AI analysis, PostgreSQL/Supabase and live Jinius integration are proposed work. Installation and test commands will be documented when the existing MVP is imported and checked.

## Local checkout

```sh
git clone https://github.com/pavlospetrides/trustpay-.git
cd trustpay-
```

Read CONTRIBUTING.md, claim an issue, and create a task branch before making changes. GitHub stores the shared code and work record. Each teammate runs the application in their own development environment.
