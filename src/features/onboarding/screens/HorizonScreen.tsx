import { copy } from '@/content/copy';
import { HORIZON_SCENE, HORIZON_VALUES } from '@/features/onboarding/three-choice/scenes';
import { ThreeChoiceScreen } from '@/features/onboarding/three-choice/ThreeChoiceScreen';
import { useOnboarding, type Horizon } from '@/state/onboarding';

const STEP = 2;
// The golden sets this title smaller than the token, and breaks it after "needs".
const TITLE = { fontSize: 32, lineHeight: 31, lineEm: 8.2, measure: 300, top: 35.5, gap: 6.5 };
const OPTIONS = HORIZON_VALUES.map((value, i) => ({
  value,
  title: copy.horizon.options[i]?.title ?? '',
  detail: copy.horizon.options[i]?.detail ?? '',
}));

export function HorizonScreen() {
  const horizon = useOnboarding((state) => state.horizon);
  const update = useOnboarding((state) => state.update);
  return (
    <ThreeChoiceScreen<Horizon>
      screen="horizon"
      step={STEP}
      title={copy.horizon.title}
      subtitle={copy.horizon.subtitle}
      cta={copy.horizon.cta}
      titleSize={TITLE}
      scene={HORIZON_SCENE}
      options={OPTIONS}
      value={horizon}
      onChange={(next) => update({ horizon: next })}
    />
  );
}
