# AGENTS.md instructions

## Working Principles

- Start with the smallest workflow that can finish the task safely.
- Prefer evidence over confidence: inspect files, run targeted checks, then claim results.
- Keep reusable rules, prompts, skills, and templates in tracked files; keep secrets and machine paths out of the repo.
- For this Chrome extension, trace behavior across the Manifest V3 service worker, popup UI, Chrome APIs, local storage, build, and release boundaries when symptoms cross them.

## Task Types

- Small: one file or one answer, no durable plan. Use the matching skill directly.
- Medium: several steps or files. Clarify goal, write a short plan, implement, verify.
- Large: sustained research, design, and implementation. Use an `ExecPlan` from `.agent/PLANS.md`.
- Route architecture work through `architect`, bugs through `bugfix`, behavior-preserving reshapes through `refactor`, and session transfer through `handoff`.
- Do not claim completion without fresh verification.

## Subtask Rules

- Split complex tasks when work can be owned independently, touches unrelated areas, or benefits from fresh context.
- Give each subtask clear ownership, inputs, forbidden files, acceptance checks, and expected output.
- Do not run parallel writers on the same files unless one is read-only.
- Review subtask output before merging it into the main answer or plan.

## ExecPlan Milestone Gates

- Any task executed under an `ExecPlan` milestone must pass three review gates before the milestone is complete.
- Gate 1 is `逻辑反方/辩论` review: challenge the approach, surface logic holes, edge cases, and simpler alternatives.
- Gate 2 is `设计一致性 review`: compare the code and verification state against the approved design and active `ExecPlan`, and call out scope drift or missing pieces.
- Gate 3 is `影响面与性能 review`: inspect unrelated paths, coupling, permissions, storage cost, and user-visible performance.
- When subagent tooling is unavailable, stop at the milestone boundary and report that the required gates cannot be satisfied. Do not silently downgrade this requirement to a single-agent self-review.

## Chinese Review Documents

- Any design doc, ExecPlan, milestone note, review report, handoff, or approval-facing document must include a Chinese review version.
- Prefer Chinese as the main review language. Add English technical notes only when useful.
- Record the three milestone gates in Chinese or include a Chinese summary beside any English detail.

## Handoff Rules

- For multi-step work, produce a handoff before ending the session, pausing incomplete work, or crossing the context budget.
- A handoff must include goal, current state, changed files, verification evidence, remaining work, blockers, a subtask queue, and a clean-session start prompt.
- Do not include secrets, provider endpoints, auth files, logs, sqlite state, or session dumps.

## Shell and Git

- Prefer PowerShell on Windows and `rg` for search.
- Never revert existing changes that were not made for the current task.
- Never use destructive reset or checkout commands without explicit user instruction.
- Keep `.superpowers/`, dependencies, builds, coverage, logs, and machine-local state out of Git.

## ExecPlan Usage

When writing complex features or significant refactors, use an ExecPlan (as described in .agent/PLANS.md) from design to implementation.
