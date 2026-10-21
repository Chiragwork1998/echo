# ECHO implementation rules

Read `product-handoff/HANDOFF_TO_CODING_AGENT.md` before changing UI. The entire `product-handoff/` directory is immutable reference material.

- Golden images are visual requirements. Written specifications define behavior.
- Do not change locked copy, tokens, assets, routes, or geometry without an approved decision recorded in `docs/`.
- Do not invent visual designs for Echoes, Patterns, or You; implement only functional route shells until their golden screens arrive.
- Keep journal text, audio, reflections, and prompt answers out of logs, analytics, crash reports, notifications, fixtures derived from real users, and commit history.
- Preserve offline-first behavior and encrypt content before persistence or sync.
- Keep changes bounded to the assigned task and report all assumptions.
- Run the relevant type, lint, behavior, and screenshot checks before declaring a task complete.
- Never commit credentials, signing files, local environment files, or production secrets.

## Expo rules

- This is an Expo and React Native mobile app. Prioritize mobile performance and cross-platform compatibility.
- Read the installed Expo major version before changing Expo or React Native APIs and consult matching versioned Expo documentation.
- Use `npx expo install <package>` for Expo-compatible dependencies.
- Use Expo Router for navigation; routes live in `app/` and non-route code lives in `src/`.
- When native `ios/` and `android/` directories are absent, configure native behavior through Expo config and plugins.
- Run typecheck, lint, and Expo Doctor before declaring foundation work complete.

