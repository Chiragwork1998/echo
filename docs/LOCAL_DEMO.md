# ECHO local app

Run from `mobile/`:

```powershell
npm run web -- --port 8091 --localhost --max-workers 2
```

Open http://localhost:8091/demo.html for the screen list and phone-sized live app, or http://localhost:8091 for the app alone.

The active app starts with the Welcome and eight onboarding screen compositions from `echo-mobile-foundation`: Begin → Intent → Horizon → Voice → Rhythm → Privacy → Arrival → First Echo → Completion → optional sign-up/sign-in or Skip → Today. Interrupted onboarding resumes at its saved step. Completed cached sessions return to Today. Use Return to welcome in the preview, or http://localhost:8091/?welcome=1, to see the introduction again without deleting entries.

From Today, choose Guide me, Free write, or Speak, then open your journal directly. Home has no arrival check-in section. Keep this echo confirms the save; the closing feeling and thought are optional. The four main tabs sit in a full-width base anchored to the bottom of each main screen. Echoes provides search, favorites, reading, editing, sharing, and confirmed deletion. Patterns provides a calendar and optional check-in summaries. You manages preferences and account actions.

Double-tap/click any ECHO header wordmark to switch between Day and Night. A single tap/click does not change the appearance. The appearance applies across the app and is remembered after reload; double-tapping the wordmark keeps you on the same screen.

The wrapper is `public/demo.html`. It embeds the real Expo web app at 393 x 852 and follows the current route. Entries, drafts, and preferences are encrypted in IndexedDB and survive reload. Keep using the same browser and origin/port. Clearing site data removes this local journal; signing in is not cloud backup. No sample entries are added to the user's journal.


## Updated journaling UX

The entry flow is `/` → `/onboarding/intent` through `/onboarding/completion` → `/sign-in` → sign in or Skip → `/home`. Users who already finished account choice return directly to `/home`. The daily flow is `/home` → `/journal` → `/journal-complete` → `/home`. Entries open at `/entry/[id]`. See `UX_RITUAL_DECISION.md` and `MOTION_REFERENCES.md` for decisions and the Jitter motion adaptations.

Native microphone capture, biometric security, reminders, and keyboard behavior still need physical-device testing. Automated authentication tests intercept provider calls and use synthetic accounts; real Google or email authentication requires the user's own provider session.
