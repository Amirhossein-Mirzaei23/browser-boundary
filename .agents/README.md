# Local Agent Resources

This directory stores version-controlled AI-agent resources for this repository.

```text
.agents/
├── agents/                 # Project-specific agent definitions
│   └── <agent-name>.md
└── skills/                 # Reusable Agent Skills
    └── <skill-name>/
        ├── SKILL.md         # Required skill definition
        ├── scripts/         # Optional executable helpers
        ├── references/      # Optional detailed documentation
        ├── templates/       # Optional reusable templates
        └── assets/          # Optional static resources
```

Hermes discovers `.agents/skills/` as a project-local skill directory. On first use, run `hermes skills trust` from the repository root if Hermes requests it.

See the root `AGENTS.md` for repository-wide instructions.

## Available Resources

- Agent: `agents/npm-package-growth-strategist.md`
- Skill: `skills/npm-package-growth-strategist/SKILL.md`
