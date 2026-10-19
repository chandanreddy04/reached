import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { fetchHistory, type HistoryItem } from '@/services/server';
import { useSafety } from '@/state/safety-store';
import { formatClock, formatWhen } from '@/utils/time';

/**
 * "Recent activity": your last check-ins and SOS alerts, newest first, read
 * from the server (the privacy rules only let you see your own).
 */
export function RecentActivity() {
  const { checkIn } = useSafety();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const history = await fetchHistory();
    setLoading(false);
    setFailed(history === null);
    if (history) setItems(history);
  }, []);

  // Reload whenever this tab is opened, or a check-in starts or ends.
  const checkInKey = checkIn?.server?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      load();
      // checkInKey isn't used inside, but listing it makes the history reload
      // when a check-in starts or ends while this tab is open.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, checkInKey]),
  );

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Recent activity</ThemedText>

      {failed && (
        <ThemedText type="small" style={{ color: Brand.red }}>
          Couldn&apos;t load your history. Check your internet and tap Refresh.
        </ThemedText>
      )}
      {items === null && loading && <ActivityIndicator />}
      {items?.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing yet. Your check-ins and SOS alerts will appear here.
        </ThemedText>
      )}

      {items?.map((item) => (
        <ThemedView key={`${item.kind}-${item.at}`} type="backgroundElement" style={styles.row}>
          <ThemedText type="smallBold">
            {formatWhen(new Date(item.at))} ·{' '}
            {item.kind === 'sos'
              ? '🆘 SOS'
              : `Check-in, back by ${formatClock(new Date(item.returnBy))}`}
          </ThemedText>
          <ThemedText type="small" style={{ color: outcomeColor(item) }}>
            {describeOutcome(item)}
          </ThemedText>
        </ThemedView>
      ))}

      <BigButton label={loading ? 'Loading…' : 'Refresh'} variant="plain" onPress={load} disabled={loading} />
    </View>
  );
}

// "Texted 1 of 1 [trial template] (John: …error…)" -> "texted 1 of 1".
function shortSummary(summary: string | null) {
  if (!summary) return null;
  if (summary === 'No one in Circle') return 'no one in Circle';
  return summary.replace(/\s*\[trial template\]/, '').replace(/\s*\(.*$/, '').toLowerCase();
}

// One line describing how it ended.
function describeOutcome(item: HistoryItem): string {
  if (item.kind === 'sos') {
    const texted = shortSummary(item.alertsSummary) ?? 'sending…';
    return `${capitalize(texted)} · ${item.hadLocation ? '📍 location shared' : 'no location'}`;
  }
  switch (item.status) {
    case 'active':
      return '⏳ In progress';
    case 'safe':
      return item.endedAt ? `✅ Safe at ${formatClock(new Date(item.endedAt))}` : '✅ Safe';
    case 'missed': {
      let text = '🔴 Missed';
      const alerts = shortSummary(item.alertsSummary);
      if (alerts) text += `: Circle ${alerts}`;
      if (item.confirmedSafeAt) {
        const allClear = item.allClearSummary;
        text += ' · ✅ Safe later';
        if (allClear?.startsWith('Texted')) text += `, all-clear ${shortSummary(allClear)}`;
        else if (allClear === 'Sending…') text += ', sending all-clear…';
      }
      return text;
    }
  }
}

function outcomeColor(item: HistoryItem) {
  if (item.kind === 'sos') return Brand.red;
  if (item.status === 'missed' && !item.confirmedSafeAt) return Brand.red;
  return Brand.green;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
});
