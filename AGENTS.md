# Repository Agent Guide

## Project

`browser-boundary` is a TypeScript library and CLI for finding the oldest real browser version that can run a website.

## Commands

- Install dependencies: `npm ci`
- Run unit tests: `npm test`
- Type-check: `npm run typecheck`
- Build: `npm run build`
- Check the published package contents: `npm run pack-check`

## Working Rules

- Read the relevant implementation and tests before editing.
- Keep changes focused and follow the existing TypeScript style.
- Add or update tests for behavior changes and bug fixes.
- Run tests, type-checking, and the build before declaring work complete.
- Do not commit generated `dist/`, `reports/`, browser caches, or log files.

## Local Agent Resources

- Reusable project skills live in `.agents/skills/<skill-name>/SKILL.md`.
- Project-specific agent definitions live in `.agents/agents/<agent-name>.md`.
- Skills follow the Agent Skills format: YAML frontmatter with `name` and `description`, followed by focused procedures. Optional support files belong under the skill's `scripts/`, `references/`, `templates/`, or `assets/` directories.
- Keep agent definitions narrow: state the role, responsibilities, relevant paths, required checks, and expected output.
