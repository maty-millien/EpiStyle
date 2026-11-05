# AGENTS.md

EpiStyle is a VS Code extension that runs Epitech's coding style checker (epiclang with the Banana plugin) on save, either from a local install or in a Docker image built from Epitech's PPA. It's written in TypeScript and built with Vite+.

## Rules

- You can launch an Extension Development Host or a Docker container to test, but always stop it at the end of your turn.
- Run `bun run ci` after every edit.
- Do not write comments in the code.
- Release by bumping `version` in `package.json` and pushing to `main`. CI creates the tag, publishes to the Marketplace and creates the GitHub release. Never create tags by hand.
