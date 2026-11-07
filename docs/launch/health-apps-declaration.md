# Health apps declaration

For Play Console, Policy, App content, Health apps. Every app must complete this declaration, including
apps only on a testing track. The categories below are Play's own, as listed in the Play Console Help
article "Provide information for the Health apps declaration form" (checked 8 November 2026).

## What ECHO is, for this form

Wellness software. ECHO offers breathing practices for how a person feels, a daily spoken or written
journal, morning intention setting, and reflections on recurring themes in the person's own entries. It
does not diagnose, treat, monitor or manage any disease or condition, takes no body measurements
(there is no heart reading in 1.0), connects to no health service, and is not a medical device. It says
so in the app: "ECHO is wellness software. It is not therapy, diagnosis, or emergency care."
(`src/features/you/youCopy.ts`), and every pattern card carries "A reflection from your own words. Not
therapy, diagnosis or advice." (`src/features/patterns/patternsCopy.ts`).

## Health features to declare

### Health and fitness

| Category | Declare | Why |
|---|---|---|
| Activity and fitness | No | No activity, exercise or body tracking. |
| Nutrition and weight management | No | |
| Period tracking | No | |
| Sleep management | **Yes** | The Sleep practice ("Can't sleep": a 4, 7, 8 breath, then long breaths out while the voice fades and the screen goes dark) is a guided exercise to help someone get to sleep. Play's description of this category includes guided exercises. ECHO does not track sleep. |
| Stress management, relaxation, mental acuity | **Yes** | The core of Breathe: short guided breathing practices for feeling anxious, panicky, hurt, angry, overwhelmed or low, and the reflective journal. This is the category's own description: guidance on stress and relaxation techniques. |

### Medical

| Category | Declare | Why |
|---|---|---|
| Diseases and conditions management | No | |
| Clinical decision support | No | |
| Disease prevention and public health | No | |
| Emergency and first aid | No | ECHO shows free helplines when a person's own entries mention suicide or self harm, and tells them to call their local emergency number. That is a signpost to services, not an emergency service. |
| Healthcare services and management | No | |
| **Mental and behavioral health** | **No (the owner's call, see below)** | Play describes it as "mental health support, counseling, and addiction recovery programs". ECHO is not counselling, therapy or a recovery programme, and says so. |
| Medical reference and education | No | |
| Medication and treatment management | No | |
| Physical therapy and rehabilitation | No | |
| Reproductive and sexual health | No | |

### Medical device apps, health research

| Category | Declare |
|---|---|
| Medical device apps | No. ECHO is not regulated as a medical device anywhere and makes no medical claims. |
| Research studies, clinical trials, patient communities | No. |

## The judgement call: Mental and behavioral health

ECHO is positioned as mental wellness, it shows helplines, and one practice is for "a craving or an
urge". A reviewer could read that as mental health support. The recommendation is still **No**,
because:

- nothing in ECHO counsels, treats or runs a recovery programme, and the copy never claims to (the
  brief's rule: a practice is "for when you feel anxious", never "for anxiety");
- the Medical categories bring questions about regulatory status that do not fit wellness software.

If Play's review asks ECHO to add it, add it and answer the follow up questions plainly with the facts
above: not a medical device, no clinical claims, disclaimers in the app, helplines for crisis.

## If the form asks follow up questions

| Question (paraphrased) | Answer |
|---|---|
| Is the app a regulated medical device, or does it need regulatory clearance? | No. |
| Does the app make health or medical claims? | No claims of treatment or outcome. One factual statement cites published research: Settle uses cyclic sighing, which in a 2023 Stanford study improved mood more than mindfulness meditation (Balban et al., Cell Reports Medicine). |
| Does the app show disclaimers? | Yes: "ECHO is wellness software. It is not therapy, diagnosis, or emergency care." in You; "Not therapy, diagnosis or advice." on every pattern card; on a person's first practice, "If you feel dizzy or unwell, stop and breathe normally." |
| Does the app access health permissions or Health Connect? | No. The only sensitive permission is the microphone, asked only when the person chooses to speak. |
| Who is the app for? | Adults, 18 and over. |

## Keep it accurate

Update this declaration if a heart reading through the camera ships (it is "next, not in 1.0" in the
brief), or if any feature starts to track sleep, mood over time as a health measure, or a condition.
