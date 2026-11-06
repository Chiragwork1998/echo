import navigation from '@handoff/data/navigation.json';

import type { backgroundSources } from '@/design/generated/backgrounds';

export type ScreenId = keyof (typeof backgroundSources)['day'];

type Route = { id: string; path: string; next?: string; back?: string };
const routes: Route[] = navigation.routes;

const byId = (id: string | undefined) => routes.find((route) => route.id === id);

export const pathOf = (id: ScreenId) => byId(id)!.path;
export const nextPath = (id: ScreenId) => byId(byId(id)?.next)?.path;
export const backPath = (id: ScreenId) => byId(byId(id)?.back)?.path;

/** Onboarding steps 1-8, in order. Used by the header's progress. */
export const onboardingSteps = routes
  .filter((route) => route.path.startsWith('/onboarding/'))
  .map((route) => route.id);
