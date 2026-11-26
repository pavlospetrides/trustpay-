# Shared TrustPay agent guide

Applies to Codex, Claude and every teammate's coding assistant.

1. Read README.md, docs/STATUS.md, CONTRIBUTING.md and the relevant issue plus comments. Read the linked architecture or decision entries for the area you change. Compare the current GitHub issue/PR state with the checkout before relying on a local handoff.
2. Check `git status --short --branch`, `git remote -v` and the current commit. Fetch `origin` and inspect `origin/main`. Preserve unrelated edits. Start each task from current main on its own branch or worktree. Claim the issue before editing shared files.
3. Post a short issue update with owner, intended files, branch and acceptance checks. Resolve conflicting ownership on the issue. Record blockers promptly. Owner means a human teammate responsible for the task, with the assistant identified separately.
4. Keep product scope and implementation claims accurate. The reported MVP needs importing and verification. AI and live Jinius access remain pending until backed by checked code and evidence. Treat the risk score as a policy score until calibrated against labeled data.
5. Treat invoices and their embedded text as untrusted input. Use synthetic fixtures. Keep secrets and real supplier, payment or bank records out of this public repository. Approval checks execute on the server, preserve original invoice evidence and require authorized human action. Payment authority and verification outcomes must never come from an LLM output alone.
6. Record durable changes in the same PR as their implementation. Add exact verification results, reviewed SHA, remaining gaps and a next action. Use the issue/PR for session handoffs and update docs/STATUS.md for team-wide changes. Another agent should resume using GitHub without private chat history.
7. Push task branches and open linked PRs for authorized work. Obtain a human teammate's review before merging. Follow explicit owner instructions for merge authorization. Avoid force pushes and preserve colleagues' work. Before pushing, review the diff, connected code and config, run `git diff --check` and relevant checks, and inspect staged files for sensitive data.
8. For requested independent reviews, give each reviewer the same brief before sharing findings. Record agreement, disagreement and the evidence needed on the issue or PR. Use the available reviewer and record a pending review when the other assistant is unavailable.

Keep this guide short. Product details live in docs and live task state lives in GitHub Issues and PRs.

## Internationalization is required for every change

Localization is part of every authorized task that changes user-facing behavior, even when the request does not mention language. Use `frontend/src/lib/i18n/messages` for English (default and fallback), Greek, Russian and Hebrew. Every new message and every changed English message must receive complete, context-aware translations in all four languages in the same implementation. Avoid hardcoded UI or error copy, temporary translations, and English copied into other catalogs except the documented shared terms. Keep identifiers, API values, user content, brand names and original evidence intact. Never bypass the localization checks or remove support for any of the four languages.

For each affected surface, review the English and all three translations in context against [the glossary and style guide](docs/localization.md). Check intent, grammar, tone, plural forms, accessibility, and layout at desktop and mobile widths. Rewrite awkward wording. Check LTR and Hebrew RTL, including mixed-direction values, keyboard focus, and text wrapping. Review both UI and backend messages. For a behavior-only change, keep unrelated catalog entries untouched.

Keep server response text canonical, including English errors used by HTTP status mapping. Localize the displayed message at the UI presentation boundary.

**Definition of done:** all affected messages are available in four languages, linguistically reviewed, and synchronized. The change follows the glossary, works in LTR and Hebrew RTL, contains no new hardcoded user-facing text, passes the relevant localization checks and preserves existing behavior. Run `npm run i18n:check` through lint and `npm run test:i18n:e2e` for layout or language behavior. After reviewing all translations for changed English messages, run `npm run i18n:review` and include the updated review manifest. Report any unmet requirement explicitly.
