# Component inventory

| Component | Key geometry | States |
|---|---|---|
| `EchoBackground` | full viewport, cover, per-screen focal point | day, night, loading, fallback |
| `ReadabilityScrim` | full viewport, top + bottom gradients | day, night |
| `EchoWordmark` | 28 pt, tracking 12 pt | light, ink |
| `OnboardingHeader` | 44 pt, back + wordmark + 8-step progress | step 1–8 |
| `ProgressSegments` | 8 × (18 × 3), gap 4 | complete/current/inactive |
| `PrimaryCTA` | 345 × 56 max, radius 28 | normal, pressed, disabled, loading |
| `GlassCard` | radius 24, 1 pt border, 24 blur | regular, strong, focused |
| `ChoiceMarker` | 22 circle, 2 pt stroke | idle, selected, disabled |
| `ToggleRow` | min 60 high | on, off, disabled, unavailable |
| `SegmentedMode` | 345 × 52, two equal halves | write, speak, disabled |
| `TimeDial` | 248–292 square by viewport | drag, keyboard picker, disabled |
| `MoodStone` | photographic hit target ≥56 | idle, selected, pressed |
| `WritingSurface` | min 280 high, radius 20 | empty, typing, saved, error |
| `TimerRing` | 52 circle | idle, active, paused, complete |
| `ReflectionCard` | radius 22, padding 24 | loading, success, offline, error |
| `TabBar` | 345 × 72, radius 30 | four tabs, selected, badge |

Use SVG icons from `assets/icons/` or the closest native system icon with identical stroke weight. Touch targets must remain at least 44 × 44 pt even where the visible icon is smaller.

