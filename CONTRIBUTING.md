# Contributing

Contributions are welcome! Please follow these guidelines.

## Development Setup

```bash
git clone https://github.com/privilegedescalation/headlamp-intel-gpu-plugin.git
cd headlamp-intel-gpu-plugin
npm install
npm start
```

## Before Submitting a PR

```bash
npm run tsc          # TypeScript type check
npm run lint         # ESLint
npm run format:check # Prettier
npm test             # All tests must pass
```

## Code Style

- TypeScript strict mode (no `any`)
- Functional React components only
- All UI from `@kinvolk/headlamp-plugin/lib/CommonComponents`
- Tests with vitest + @testing-library/react

## Commit Messages

Use conventional commit format:
- `feat:` new features
- `fix:` bug fixes
- `chore:` maintenance
- `docs:` documentation
