import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useSafety } from '@/state/safety-store';
import { formatClock, formatDuration } from '@/utils/time';

/**
 * Home screen.
 * - No active check-in: explains the app and offers a "Set a check-in" button.
 * - Active check-in: shows a live countdown and an "I'm safe" button.
 */
export default function HomeScreen() {
  const { checkIn, endCheckIn, contacts, serverConnected } = useSafety();

  // `now` is updated every second so the countdown keeps moving.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!checkIn) return; // no timer needed when there is no check-in
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer); // stop the timer when leaving the screen
  }, [checkIn]);

  async function handleImSafe() {
    // Remember whether the return time had already passed before ending it.
    const wasOverdue = checkIn !== null && checkIn.returnBy.getTime() <= Date.now();
    const result = await endCheckIn();

    // Tell the truth about whether your Circle was alerted.
    if (result.reached && !result.alreadyMissed) {
      Alert.alert('Glad you made it home!', 'Your check-in has ended. Nobody was alerted.');
    } else if (result.reached && result.alertsSentAt && result.alertsSummary !== 'Sending…') {
      Alert.alert("Glad you're safe", describeAlertsSent(result.alertsSentAt, result.alertsSummary));
    } else if (result.reached) {
      Alert.alert(
        "Glad you're safe",
        "Your check-in was already marked missed, so your Circle may have been alerted. Please let them know you're OK.",
      );
    } else {
      Alert.alert(
        'Ended on this phone only',
        wasOverdue
          ? "The server couldn't be reached. Your return time had passed, so your Circle may have been alerted. Please let them know you're OK."
          : "The server couldn't be reached, so it may still mark this check-in as missed. Check your internet.",
      );
    }
  }

  // ----- Active check-in -----
  if (checkIn) {
    const msLeft = checkIn.returnBy.getTime() - now.getTime();
    const overdue = msLeft <= 0;
    const missed = checkIn.server?.status === 'missed';

    return (
      <Screen title="You're out">
        {/* Shown once the server has noticed you didn't check in. */}
        {missed && (
          <View style={styles.missedBanner}>
            <Text style={styles.missedTitle}>MISSED CHECK-IN</Text>
            <Text style={styles.missedBody}>
              {checkIn.server?.alertsSentAt && checkIn.server.alertsSummary !== 'Sending…'
                ? describeAlertsSent(checkIn.server.alertsSentAt, checkIn.server.alertsSummary ?? null)
                : 'Texting your Circle now…'}
            </Text>
            <Text style={styles.missedBody}>
              If you&apos;re OK, tap &quot;I&apos;m safe&quot; and let them know yourself.
            </Text>
          </View>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText themeColor="textSecondary">Back by</ThemedText>
          <ThemedText type="subtitle">{formatClock(checkIn.returnBy)}</ThemedText>

          <ThemedText
            style={[styles.countdown, overdue && { color: Brand.red }]}
            accessibilityLiveRegion="polite">
            {overdue
              ? `Overdue by ${formatDuration(-msLeft)}`
              : `${formatDuration(msLeft)} left`}
          </ThemedText>

          {overdue && !missed && (
            <ThemedText type="small" themeColor="textSecondary">
              The server checks every minute and will mark this as missed shortly.
            </ThemedText>
          )}

          {/* Is the server watching this check-in? */}
          <ThemedText
            type="small"
            style={{ color: checkIn.server && !missed ? Brand.green : Brand.red }}>
            {!checkIn.server
              ? "● Not on the server: nobody will notice if your phone dies"
              : missed
                ? '● Server marked this check-in as missed'
                : '● Server is watching this check-in'}
          </ThemedText>
        </ThemedView>

        <BigButton label="I'm safe" onPress={handleImSafe} />
        <BigButton
          label="Change return time"
          variant="plain"
          onPress={() => router.navigate('/check-in')}
        />
      </Screen>
    );
  }

  // ----- No check-in -----
  return (
    <Screen title="Reached">
      <ThemedText themeColor="textSecondary">
        Heading out? Set a time you expect to be back. If you don&apos;t check in by then, your
        Circle gets alerted.
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Your Circle</ThemedText>
        <ThemedText themeColor="textSecondary">
          {contacts.length === 0
            ? 'No one yet. Add at least one trusted person.'
            : `${contacts.length} ${contacts.length === 1 ? 'person' : 'people'}: ${contacts
                .map((c) => c.name)
                .join(', ')}`}
        </ThemedText>
      </ThemedView>

      <ThemedText type="small" style={{ color: serverConnected ? Brand.green : Brand.red }}>
        {serverConnected ? '● Connected to server' : '● Not connected to server'}
      </ThemedText>

      <BigButton label="Set a check-in" onPress={() => router.navigate('/check-in')} />
      {contacts.length === 0 && (
        <BigButton
          label="Add people to your Circle"
          variant="plain"
          onPress={() => router.navigate('/circle')}
        />
      )}
    </Screen>
  );
}

/**
 * Explains what the server actually sent after a missed check-in, based on
 * its summary ("Texted 1 of 1", "Texted 0 of 2 (…)", "No one in Circle").
 */
function describeAlertsSent(sentAt: string, summary: string | null) {
  const time = formatClock(new Date(sentAt));
  if (summary === 'No one in Circle') {
    return 'Your check-in was already missed, but your Circle is empty, so nobody was texted.';
  }
  const counts = summary?.match(/^Texted (\d+) of (\d+)/);
  if (counts && counts[1] === '0') {
    return `Your check-in was already missed at ${time}, but the alert texts couldn't be delivered. Nobody in your Circle was reached.`;
  }
  const sent = counts ? ` (texted ${counts[1]} of ${counts[2]})` : '';
  return `Your check-in was already missed, and your Circle was alerted at ${time}${sent}. Please let them know you're OK.`;
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  missedBanner: {
    backgroundColor: Brand.red,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.one,
  },
  missedTitle: {
    color: Brand.onColor,
    fontSize: 18,
    fontWeight: 800,
  },
  missedBody: {
    color: Brand.onColor,
    fontSize: 14,
    lineHeight: 20,
  },
  countdown: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: 700,
    color: Brand.green,
  },
});
