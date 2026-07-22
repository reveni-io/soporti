## What does this PR do?

<!-- Describe the change clearly. What was added, removed, or modified? -->

## Why?

<!-- Why is this change needed? Link to issue/ticket if applicable. -->

## How to test

<!-- Step-by-step instructions to verify this change works correctly. -->

1.
2.
3.

---

## Checklist

You **must** check every box before requesting a review. If a box doesn't apply, check it and write "N/A" next to it.

### Scope

- [ ] This PR does **one thing only** (one feature, one fix, or one refactor)
- [ ] The diff is under 300 lines of code (excluding tests and lock files)
- [ ] I have not mixed unrelated changes (no drive-by refactors, no style fixes bundled with features)

### Quality

- [ ] I have reviewed my own diff line by line
- [ ] I understand every line of code in this PR — I can explain what it does and why
- [ ] There is no commented-out code, no leftover `console.log`, no dead code
- [ ] There are no hardcoded values that should be in configuration
- [ ] I have not introduced any new dependencies without prior discussion
- [ ] If I added new environment variables, I have updated `.env.example`

### Testing

- [ ] All existing tests pass (`npm test`)
- [ ] Code coverage has not dropped below 90% (`npm run test:coverage`)
- [ ] I have added tests for new functionality or bug fixes
- [ ] My tests verify behavior (input/output), not implementation details (spies, internal calls)
- [ ] I have tested this manually and confirmed it works

### Standards

- [ ] The linter passes with no errors or warnings (`npm run lint`)
- [ ] Code is formatted with Prettier (`npm run format`)
- [ ] All code, comments, and variable names are in English
- [ ] I followed the existing code patterns and conventions in the project
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] PR title follows Conventional Commits format (e.g. `feat(agent): add Shortcut tool`)
- [ ] This PR targets `main` as base branch

### Visual Changes

- [ ] If this PR includes visual/UI changes, I have attached screenshots or a video showing the before and after

### AI-Generated Code

- [ ] If I used AI tools, I have read and understood every line of generated code
- [ ] I have adapted AI-generated code to match this project's conventions
- [ ] I have removed any over-engineering added by AI (unnecessary abstractions, excessive error handling, redundant comments)

---

### Notes for reviewers

<!-- Optional: anything the reviewer should know, areas of uncertainty, alternative approaches considered, etc. -->
