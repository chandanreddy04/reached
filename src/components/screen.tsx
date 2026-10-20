import { type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The common frame every screen sits in: a title at the top, scrollable
 * content, and padding so nothing hides behind the phone's notch or the tab bar.
 */
export function Screen({ title, children }: { title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets(); // space taken by the notch / status bar
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      // Lets you tap buttons while the keyboard is open.
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          // On web the tab bar sits at the top, so leave extra room for it.
          paddingTop: insets.top + (Platform.OS === 'web' ? Spacing.six + Spacing.three : Spacing.four),
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}>
      {title !== '' && <ThemedText type="subtitle">{title}</ThemedText>}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
