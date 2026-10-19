import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * The bottom tab bar. Each <NativeTabs.Trigger name="..."> matches a file in
 * src/app/ (e.g. name="circle" -> src/app/circle.tsx).
 *
 * Icons: `sf` is an Apple SF Symbol (iPhone), `md` is a Google Material
 * Symbol (Android).
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="check-in">
        <NativeTabs.Trigger.Label>Check-in</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock" md="schedule" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="circle">
        <NativeTabs.Trigger.Label>Circle</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" md="group" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sos">
        <NativeTabs.Trigger.Label>SOS</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="exclamationmark.triangle" md="sos" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
