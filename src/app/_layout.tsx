import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { SafetyProvider } from '@/state/safety-store';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* SafetyProvider shares the check-in and contacts with every screen. */}
      <SafetyProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
      </SafetyProvider>
    </ThemeProvider>
  );
}
