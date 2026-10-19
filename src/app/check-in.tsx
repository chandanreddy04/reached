import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askNotificationPermission } from '@/services/notifications';
import { useSafety } from '@/state/safety-store';
import { formatClock, formatMinutes } from '@/utils/time';

// Quick choices shown as buttons (in minutes).
// __DEV__ is true only while developing (running through Expo), so the
// 1-minute test option never appears in the real app, where such a short
// check-in would cause false alarms.
const PRESETS = __DEV__ ? [1, 5, 30, 60, 120, 180] : [5, 30, 60, 120, 180];
const TEST_PRESET = 1;
const STEP = 15; // the -/+ buttons change the time by this many minutes
const MIN_MINUTES = 5; // shortest real check-in (the -/+ buttons won't go below this)
const MAX_MINUTES = 12 * 60;

/** Pick how long you'll be out, then start (or update) the check-in. */
export default function CheckInScreen() {
  const { checkIn, startCheckIn, contacts } = useSafety();
  const theme = useTheme();

  // How many minutes from now you expect to be back. Starts at 1 hour.
  const [minutes, setMinutes] = useState(60);

  // The current time, refreshed every 30 seconds so "back by" stays accurate
  // if you leave this screen open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const returnBy = new Date(now + minutes * 60 * 1000);

  function changeBy(delta: number) {
    setMinutes((m) => Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, m + delta)));
  }

  async function start() {
    // Ask for notification permission first, so the reminders can be scheduled.
    const allowed = await askNotificationPermission();

    // Use the exact time of the tap, not the last 30-second refresh.
    const savedToServer = await startCheckIn(new Date(Date.now() + minutes * 60 * 1000));
    router.navigate('/'); // go back to Home to see the countdown

    // Tell the user plainly about anything that isn't fully working.
    const problems: string[] = [];
    if (!savedToServer) {
      problems.push(
        "The server couldn't be reached, so if your phone dies nobody will notice. Check your internet; the app will retry next time it opens.",
      );
    }
    if (!allowed && Platform.OS !== 'web') {
      problems.push(
        "You won't get a reminder before your time is up. You can turn notifications on for Expo Go in your phone's Settings.",
      );
    }
    if (problems.length > 0) {
      Alert.alert('Check-in started, but…', problems.join('\n\n'));
    }
  }

  function handleStart() {
    // Warn if nobody would be alerted.
    if (contacts.length === 0) {
      Alert.alert('Your Circle is empty', 'Nobody would be alerted if you miss this check-in.', [
        { text: 'Add people', onPress: () => router.navigate('/circle') },
        { text: 'Start anyway', style: 'destructive', onPress: start },
      ]);
      return;
    }
    start();
  }

  return (
    <Screen title={checkIn ? 'Change check-in' : 'Set a check-in'}>
      <ThemedText themeColor="textSecondary">How long will you be out?</ThemedText>

      {/* Preset buttons: 5 min, 30 min, 1 hr, 2 hr, 3 hr (+ "1 min (test)" while developing) */}
      <View style={styles.presetRow}>
        {PRESETS.map((preset) => {
          const selected = preset === minutes;
          return (
            <Pressable
              key={preset}
              onPress={() => setMinutes(preset)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.preset,
                { backgroundColor: selected ? Brand.green : theme.backgroundElement },
              ]}>
              <ThemedText style={selected && { color: Brand.onColor }}>
                {preset === TEST_PRESET ? '1 min (test)' : formatMinutes(preset)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* Fine-tune with - and + */}
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.stepper}>
          <BigButton label={`− ${STEP}`} variant="plain" onPress={() => changeBy(-STEP)} />
          <ThemedText type="smallBold" style={styles.duration}>
            {formatMinutes(minutes)}
          </ThemedText>
          <BigButton label={`+ ${STEP}`} variant="plain" onPress={() => changeBy(STEP)} />
        </View>

        <ThemedText themeColor="textSecondary" style={styles.center}>
          You&apos;ll be back by
        </ThemedText>
        <ThemedText type="subtitle" style={styles.center}>
          {formatClock(returnBy)}
        </ThemedText>
      </ThemedView>

      <ThemedText type="small" themeColor="textSecondary">
        We&apos;ll remind you shortly before this time (10 minutes before, or halfway through
        for short check-ins). If you don&apos;t check in, your Circle gets alerted. (Texting
        your Circle comes in a later stage.)
      </ThemedText>

      <BigButton label={checkIn ? 'Update check-in' : 'Start check-in'} onPress={handleStart} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  preset: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  duration: {
    fontSize: 18,
  },
  center: {
    textAlign: 'center',
  },
});
