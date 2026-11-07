import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { Notice, Row, Section } from '@/features/tab-pages/parts';
import { openPaywall, restorePlus } from '@/services/plus/engine';
import { hasPlus, usePlusStore, type PlusMemory } from '@/services/plus/store';
import { tokens } from '@/design/tokens';

import { plusCopy } from './plusCopy';

/** The store's own subscriptions page, for when RevenueCat has not given one. */
const STORE_SUBSCRIPTIONS =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';

function statusLine({ trial, expiresAt, willRenew }: PlusMemory): string {
  if (expiresAt === null) return plusCopy.youActive;
  if (trial && willRenew) return plusCopy.youTrialEnds(expiresAt);
  return willRenew ? plusCopy.youRenews(expiresAt) : plusCopy.youEnds(expiresAt);
}

/**
 * You's ECHO Plus rows. Without Plus, one row that opens the paywall. With it, when it renews or
 * ends, a way to manage it in the store, and Restore purchases. A build that cannot sell Plus shows
 * nothing here: everything in it is already open.
 */
export function PlusSection() {
  const plus = usePlusStore();
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (plus.off !== null) return null;

  if (!hasPlus(plus)) {
    return (
      <View style={styles.group}>
        <Section>
          <Row
            label={plusCopy.youRow}
            detail={plusCopy.youRowDetail}
            onPress={() => openPaywall()}
          />
        </Section>
      </View>
    );
  }

  const manage = () => {
    setMessage(null);
    void Linking.openURL(plus.managementURL ?? STORE_SUBSCRIPTIONS).catch(() =>
      setMessage(plusCopy.manageFailed),
    );
  };

  const restore = async () => {
    setMessage(null);
    setRestoring(true);
    const result = await restorePlus();
    setRestoring(false);
    setMessage(
      result.kind === 'restored'
        ? plusCopy.restored
        : result.kind === 'nothing'
          ? plusCopy.nothingToRestore
          : result.reason === 'offline'
            ? plusCopy.restoreOffline
            : plusCopy.restoreFailed,
    );
  };

  return (
    <View style={styles.group}>
      <Section>
        <Row label={plusCopy.youRow} detail={statusLine(plus)} />
        <Row label={plusCopy.manage} detail={plusCopy.manageDetail} onPress={manage} />
        <Row
          label={restoring ? plusCopy.restoring : plusCopy.restore}
          detail={plusCopy.restoreDetail}
          busy={restoring}
          onPress={() => void restore()}
        />
      </Section>
      {message && <Notice message={message} />}
    </View>
  );
}

const styles = StyleSheet.create({ group: { gap: tokens.space[8] } });
