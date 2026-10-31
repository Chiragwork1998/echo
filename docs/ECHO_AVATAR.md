# Echo Avatar

Open **You → Make it yours → Echo Avatar** to pick a companion. Choose **None** to hide it. The selected character floats over every screen of the app (not the signed-out sign-in or lock screens) on a transparent background, without a close button, and opens a conversation when tapped. Drag it anywhere inside the screen's safe area; it stays where it is dropped. Avatar choice and position survive reload; conversations remain temporary and are cleared when the account changes, the journal locks, the avatar changes, or the app restarts.

The picker includes the nine characters from the owner's reference, implemented as original React Native vector artwork with small optional idle animations. No additional avatar package is required. Reduced Motion disables their idle animation.

## Local companion connection

The existing backend is in `../../echo/server/` from this document's folder. The companion runs on **DeepSeek V4.1 Flash** (API model `deepseek-flash`, thinking off for quick replies). The backend's ignored `.env.local` holds the private `DEEPSEEK_API_KEY` (optional `DEEPSEEK_MODEL`) and local guest opt-in; without a DeepSeek key it falls back to OpenAI via `OPENAI_API_KEY` and `ECHO_COMPANION_MODEL`. Replace the key there after rotation and restart the backend. Never add a provider key to an `EXPO_PUBLIC_` variable or mobile source.

From the backend folder:

```powershell
$env:HOST='127.0.0.1'
$env:PORT='3000'
node --env-file=.env --env-file=.env.local node_modules/tsx/dist/cli.mjs src/server.ts
```

The mobile local environment points `EXPO_PUBLIC_COMPANION_API_BASE_URL` to `http://localhost:3000`. The public main API setting remains unchanged. Localhost is for this computer's browser; a phone build needs a reachable HTTPS backend URL. Public HTTP endpoints are rejected for companion requests.

The backend exposes `GET /v1/companion/status` and `POST /v1/companion/reply`. Chat input is limited to 12 messages, 1,200 characters each and 6,000 total, with a server rate limit of 30 replies per hour. Provider responses have a bounded output budget. The provider key, authorization headers, messages, and replies are not logged. Journal entries and recordings are never read automatically by the companion.

Production deployment needs the key in the deployment secret store, the companion model setting, and approved browser origins in `ECHO_COMPANION_ORIGINS`. Local guest access is disabled in production and in the Vercel adapter. This change configures the local backend only.

The DeepSeek request format (`POST https://api.deepseek.com/chat/completions`, `thinking: {type: "disabled"}`, `max_tokens`) was checked against the [DeepSeek API reference](https://api-docs.deepseek.com/api/create-chat-completion) on 31 October 2026.
