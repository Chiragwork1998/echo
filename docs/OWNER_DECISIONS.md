# Owner decisions

Decisions made directly by Chirag. These override `product-handoff/`, including the goldens, and record the approval `AGENTS.md` requires.

| ID | Date | Decision | Replaces |
|---|---|---|---|
| D-001 | 2026-11-06 | Night is the default theme on first launch, regardless of the phone's appearance setting. Day and Automatic remain available as choices in You. | `INTERACTIONS_AND_STATES.md`: Automatic default following system appearance. |
| D-002 | 2026-11-06 | The Landing BEGIN button is redesigned to be more aesthetic and elegant than the glass pill in the Landing golden. Its size, position, label, and behaviour stay as specified. | The Landing golden's button styling only. |
| D-003 | 2026-11-06 | The daily writing session is immersive. Pressing Begin on Home dissolves everything on screen, leaving only the mountains and the person's words. There is no header, timer, card, or visible control while writing. | The golden session chrome, for the daily session only. First Echo in onboarding keeps its golden. |
| D-004 | 2026-11-06 | ECHO uses the book experience from `yash/echo`: the shelf of volumes, the cover opening, and turning pages. It is brought across and rebuilt on the current foundation. The rest of that branch stays rejected, including the Avatar companion. | The First Echo golden's writing surface, and the book's mix with D-003 is set by the lead: the mountains stay visible. |
| D-005 | 2026-11-06 | Spoken entries are transcribed with OpenAI's best model (`gpt-transcribe`) and cleaned to Wispr Flow quality (`gpt-6.1-terra`). Hindi in cleaned text is written in Roman script. People are told what leaves the device and consent before their first use. | The on-device-first recommendation. Local capture and encryption are unchanged. |
| D-006 | 2026-11-06 | ECHO is voice-first: most people will speak. Begin starts a spoken session, writing is the alternative, and Home offers "Write instead". The person's last-used mode is remembered, and Speak is the default. | Write as the default in the goldens and specs, and the Home pill "Speak instead". |
