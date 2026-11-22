# Working together

## Beginning a task

Read docs/STATUS.md and the issue's latest comments. Search existing issues and PRs before creating a duplicate. Each task has an outcome, one responsible human, acceptance checks and dependencies. Claim it through an assignee or a comment stating your GitHub username and intended branch. Leave tasks unassigned until a teammate takes responsibility.

Fetch current main, inspect local edits and start a task branch, for example `feat/12-invoice-upload`, `fix/18-approval-gate` or `docs/7-api-contract`. A separate clone or worktree is useful when two assistants share one machine. Coordinate shared schema/API changes in their issue before parallel implementation.

```sh
git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/12-invoice-upload
```

Stop and preserve local work if a command encounters conflicting edits. Adapt the issue number and branch name to the actual task.

## During a task

Use issue comments for progress, blockers and questions. Put technical proposals in a PR or a linked document. Record accepted decisions in docs/DECISIONS.md with the deciding person, rationale and issue/PR link. A proposal stays marked proposed until accepted. Update the relevant docs alongside code so main describes the merged implementation.

Run checks appropriate to the changed behavior. Record exact commands, outcomes and test environment. For payment/security logic, cover the concrete failure cases in docs/ACCEPTANCE.md. Keep sensitive payloads out of logs and screenshots.

## Delivery and review

Review the staged diff and run `git diff --check`, then push your branch and open a PR linked to its issue. An independent reviewer reads the change and its affected callers. Record the reviewed SHA and resolve critical findings before requesting human approval. New commits that change reviewed behavior need another look at the changed area. A human teammate reviews before an authorized merge. When the work is merged, update issue status and link the proving checks.

The empty-repository bootstrap is the initial main commit. Subsequent work uses branches and PRs. Repository branch protections require the owner's configuration. This guide describes the team's intended process while protections are pending.

## Ending each work session

Post a handoff on the task's issue or PR using this format.

```text
Responsible teammate / assistant
Branch / latest pushed SHA / PR
Outcome and files changed
Checks run and results
Open findings, blockers and unpushed work
Next action and owner
```

Update docs/STATUS.md when a milestone, shared dependency, approved scope or team-wide blocker changes. Keep detailed session history in issues/PRs so the status page stays small. Handoffs should say whether work exists only locally, on a branch, or on main.

## Start prompt for any assistant

```text
Work in pavlospetrides/trustpay-. Read AGENTS.md and docs/STATUS.md from current main, then read issue #<number> and its latest comments plus linked PRs. Check the checkout and remote before editing. Claim the task, use a dedicated branch, implement its acceptance criteria, and record checks and a handoff in GitHub. Keep related documentation current. Open a PR for human review and report any remaining gaps.
```
