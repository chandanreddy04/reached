import Constants from 'expo-constants';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { formatWhen } from '@/utils/time';

/**
 * "Version 1.0.0 · Update Today, 11:05 PM (01a15c48)". Shows which code the
 * app is running, so you can check that an instant update (EAS Update)
 * arrived, and tell us exactly what you're on when reporting a problem.
 */
export function AppVersion() {
  const version = Constants.expoConfig?.version ?? '?';
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
      Version {version} · {describeRunningCode()}
    </ThemedText>
  );
}

function describeRunningCode(): string {
  // Expo Go and the web preview always run in development mode, straight
  // from your computer; instant updates only apply to installed builds.
  if (__DEV__) return 'Development';
  try {
    // Loaded inside try/catch so a missing updates module (e.g. in Expo Go or
    // the web preview) can never crash the Account screen.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as typeof import('expo-updates');
    if (!Updates.isEnabled) return 'Development';
    if (Updates.isEmbeddedLaunch || !Updates.createdAt) return 'Built-in code (no updates yet)';
    const shortId = Updates.updateId ? ` (${Updates.updateId.slice(0, 8)})` : '';
    return `Update ${formatWhen(Updates.createdAt)}${shortId}`;
  } catch {
    return 'Development';
  }
}

const styles = StyleSheet.create({
  text: {
    textAlign: 'center',
  },
});
