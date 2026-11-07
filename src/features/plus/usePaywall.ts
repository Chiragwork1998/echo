import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { getNotificationPermission } from '@/services/permissions';
import { buyPlan, loadPlans, refreshPlus, restorePlus } from '@/services/plus/engine';
import { hasPlus, usePlusStore } from '@/services/plus/store';
import type { Plan, PlansResult } from '@/services/plus/types';

import { plusCopy } from './plusCopy';

export type PaywallView =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'unavailable' }
  | { kind: 'plans'; plans: Plan[] }
  /** Already ECHO Plus: after a purchase, a restore, or opened by someone who has it. */
  | { kind: 'plus' };

export type PaywallNotice = { message: string; tone: 'problem' | 'news' };

const yearlyFirst = (plans: Plan[]) => plans.find((plan) => plan.period === 'year') ?? plans[0];

function announce(message: string) {
  AccessibilityInfo.announceForAccessibility?.(message);
}

/**
 * Everything the paywall knows and does. Plans come from the store each time it opens, yearly
 * selected. A purchase the person cancels says nothing; one that fails says what failed and what to
 * do, inline, and the plans stay as they were.
 */
export function usePaywall() {
  const plus = usePlusStore(hasPlus);
  const [plans, setPlans] = useState<PlansResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buying' | 'restoring' | null>(null);
  const [notice, setNotice] = useState<PaywallNotice | null>(null);
  const [notifications, setNotifications] = useState(true);
  const alive = useRef(true);
  const working = useRef(false);

  /** The store's answer, shown. Yearly is chosen unless the person had already chosen a plan. */
  const show = useCallback((result: PlansResult) => {
    if (!alive.current) return;
    setPlans(result);
    if (result.kind !== 'plans') return;
    setSelectedId((current) =>
      result.plans.some((plan) => plan.id === current)
        ? current
        : (yearlyFirst(result.plans)?.id ?? null),
    );
  }, []);

  const retry = useCallback(() => {
    setPlans(null);
    setNotice(null);
    void loadPlans().then(show);
  }, [show]);

  useEffect(() => {
    alive.current = true;
    void loadPlans().then(show);
    void refreshPlus();
    // The fine print promises a reminder, which needs notifications. Read only: ECHO never asks here.
    void getNotificationPermission().then((permission) => {
      if (alive.current) setNotifications(permission.status === 'granted');
    });
    return () => {
      alive.current = false;
    };
  }, [show]);

  const view: PaywallView = plus
    ? { kind: 'plus' }
    : plans === null
      ? { kind: 'loading' }
      : plans.kind === 'plans'
        ? { kind: 'plans', plans: plans.plans }
        : { kind: plans.kind };

  const selected =
    view.kind === 'plans' ? (view.plans.find((plan) => plan.id === selectedId) ?? null) : null;

  const choose = useCallback((id: string) => {
    if (working.current) return;
    setSelectedId(id);
    setNotice(null);
  }, []);

  const buy = useCallback(async () => {
    if (working.current || !selected) return;
    working.current = true;
    setBusy('buying');
    setNotice(null);
    try {
      const result = await buyPlan(selected.id);
      if (!alive.current) return;
      if (result.kind === 'bought') announce(plusCopy.yours);
      if (result.kind === 'pending') {
        setNotice({ message: plusCopy.pending, tone: 'news' });
        announce(plusCopy.pending);
      }
      if (result.kind === 'failed') {
        const message = plusCopy.failed[result.reason];
        setNotice({ message, tone: 'problem' });
        announce(message);
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }, [selected]);

  const restore = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    setBusy('restoring');
    setNotice(null);
    try {
      const result = await restorePlus();
      if (!alive.current) return;
      const message =
        result.kind === 'restored'
          ? plusCopy.restored
          : result.kind === 'nothing'
            ? plusCopy.nothingToRestore
            : result.reason === 'offline'
              ? plusCopy.restoreOffline
              : plusCopy.restoreFailed;
      setNotice({ message, tone: result.kind === 'failed' ? 'problem' : 'news' });
      announce(message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }, []);

  return { view, selected, choose, buy, restore, retry, busy, notice, notifications };
}
