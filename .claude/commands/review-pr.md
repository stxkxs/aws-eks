# /review-pr - CDK-Aware PR Review

Perform a thorough, CDK-aware code review of the current branch.

## Usage
```
/review-pr [base-branch]
```

## Arguments
- `base-branch`: Optional. The branch to diff against (default: main)

## What it does
1. Shows a diff summary against the base branch
2. Performs file-by-file analysis with CDK-specific checks
3. Runs the validation suite
4. Outputs a structured review

## Example
```
/review-pr
/review-pr main
/review-pr develop
```

---

When this command is invoked:

1. Set base branch to `$ARGUMENTS` if provided, otherwise "main".

2. Get the diff summary:
```bash
git diff $BASE --stat
git diff $BASE --name-only
```

3. For each changed file, read the diff and analyze:
```bash
git diff $BASE -- <file>
```

4. CDK-specific review checks:
   - **Config changes**: Are feature flags consistent across environments? Are Helm versions pinned?
   - **Stack changes**: Are construct IDs stable (renaming causes replacement)? Are dependencies correct?
   - **Helm values**: Do new values follow the config system (not hardcoded in stacks)?
   - **Types**: Are new properties `readonly`? Are interfaces exported?
   - **Tests**: Do changed stacks have corresponding test updates?
   - **Security**: No hardcoded secrets, account IDs, or overly broad IAM policies?

5. Run validation:
```bash
npm run build && npm test
```

6. Output a structured review:
   - **Summary**: What the PR does in 1-2 sentences
   - **Files changed**: Table with file, change type, risk level
   - **Findings**: Any issues found, categorized as blocker/warning/suggestion
   - **Validation**: Build and test results
   - **Verdict**: Approve / Request changes / Needs discussion
