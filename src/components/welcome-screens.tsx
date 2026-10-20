import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The three welcome pages. Edit the wording here.
const PAGES = [
  {
    emoji: '⏰',
    title: 'Heading out?',
    text: 'Tell Reached when you expect to be back. A date, a late run or a trip: it takes one tap.',
  },
  {
    emoji: '🔔',
    title: "We'll check on you",
    text: 'Just before your time is up, you get a reminder. Tap "I\'m safe" and you\'re done.',
  },
  {
    emoji: '📍',
    title: 'Your Circle has your back',
    text: 'Miss your check-in and the people you trust get a text. Feel unsafe? SOS sends your location in one tap.',
    note: 'No tracking. Your location is only shared when you press SOS.',
  },
];

/**
 * A short introduction shown once per phone, before the login screen (see
 * src/app/_layout.tsx). `onDone` is called after "Get started" or "Skip".
 */
export function WelcomeScreens({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const page = PAGES[index];
  const isLast = index === PAGES.length - 1;

  return (
    <Screen title="">
      {/* No page title: each page has its own heading below. */}
      {/* Skip (hidden on the last page, where "Get started" does the same) */}
      <View style={styles.topRow}>
        {!isLast && (
          <Pressable onPress={onDone} accessibilityRole="button" hitSlop={Spacing.three}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Skip
            </ThemedText>
          </Pressable>
        )}
      </View>

      <View style={styles.page}>
        <View style={styles.picture}>
          <Text style={styles.emoji} accessible={false}>
            {page.emoji}
          </Text>
        </View>
        <ThemedText type="subtitle" style={styles.center}>
          {page.title}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {page.text}
        </ThemedText>
        {page.note && (
          <ThemedText type="small" style={[styles.center, { color: Brand.green }]}>
            {page.note}
          </ThemedText>
        )}
      </View>

      {/* Progress dots */}
      <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${PAGES.length}`}>
        {PAGES.map((p, i) => (
          <View
            key={p.title}
            style={[
              styles.dot,
              { backgroundColor: i === index ? Brand.green : theme.backgroundSelected },
            ]}
          />
        ))}
      </View>

      <BigButton
        label={isLast ? 'Get started' : 'Next'}
        onPress={isLast ? onDone : () => setIndex(index + 1)}
      />
      {index > 0 && <BigButton label="Back" variant="plain" onPress={() => setIndex(index - 1)} />}
    </Screen>
  );
}

const PICTURE_SIZE = 140;

const styles = StyleSheet.create({
  topRow: {
    alignItems: 'flex-end',
    minHeight: 24,
  },
  page: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  picture: {
    width: PICTURE_SIZE,
    height: PICTURE_SIZE,
    borderRadius: PICTURE_SIZE / 2,
    backgroundColor: Brand.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  emoji: {
    fontSize: 64,
  },
  center: {
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
