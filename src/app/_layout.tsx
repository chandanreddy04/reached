import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { LoginScreen } from '@/components/login-screen';
import { SafetyProvider, useSafety } from '@/state/safety-store';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* SafetyProvider shares login, check-in and contacts with every screen. */}
      <SafetyProvider>
        <AnimatedSplashOverlay />
        <LoginGate />
      </SafetyProvider>
    </ThemeProvider>
  );
}

// Logged out: show the login screen. Logged in: show the tabs.
function LoginGate() {
  const { loggedInPhone } = useSafety();
  return loggedInPhone ? <AppTabs /> : <LoginScreen />;
}
