# ECHO motion references

The owner requested the free UI elements at https://jitter.video/templates/ui-elements/ during the experience redesign.

These Jitter items are animation templates, not executable React Native controls. Their motion is adapted as real accessible React Native interactions rather than embedding rendered video controls. No Jitter-branded artwork or external logos are copied.

- Glass Button — https://jitter.video/template/glass-button/ — restrained moving highlight on focus and press.
- Continue Button Interaction — https://jitter.video/template/continue-button-interaction/ — tactile compression, spring release, directional arrow response.
- On / Off Toggle — https://jitter.video/template/on-off-toggle/ — continuous thumb movement with a controlled spring.
- Loading Spinner: Success Animation — https://jitter.video/template/loading-spinner-success-animation/ — real loading state followed by an actual saved confirmation.

Implementation: MotionButton, MotionToggle, and the closing ceremony. Motion responds to interaction; reduced-motion preferences remove decorative movement. Actions and keyboard activation are immediate. Saving state reflects actual persistence. The shared PrimaryCTA inherits these controls across onboarding, writing, confirmation sheets, and preferences.
