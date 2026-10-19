import { useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';

import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useSafety } from '@/state/safety-store';

/** Your account: who you're logged in as, log out, and delete your account. */
export default function AccountScreen() {
  const { loggedInPhone, profileName, logOut, deleteAccount, checkIn } = useSafety();
  const [busy, setBusy] = useState(false);

  // Alert buttons don't work in the web preview, so there we skip the question.
  function confirm(title: string, message: string, action: string, onYes: () => void) {
    if (Platform.OS === 'web') return onYes();
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: action, style: 'destructive', onPress: onYes },
    ]);
  }

  async function handleLogOut() {
    setBusy(true);
    const problem = await logOut();
    setBusy(false);
    if (problem) Alert.alert("Can't log out yet", problem);
  }

  async function handleDelete() {
    setBusy(true);
    const problem = await deleteAccount();
    setBusy(false);
    if (problem) Alert.alert("Couldn't delete your account", problem);
  }

  return (
    <Screen title="Account">
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Logged in as</ThemedText>
        <ThemedText type="subtitle" style={styles.phone}>
          {loggedInPhone}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {profileName ? `Name: ${profileName}` : 'Add your name on the Circle tab.'}
        </ThemedText>
      </ThemedView>

      <BigButton
        label="Log out"
        variant="plain"
        disabled={busy}
        onPress={() =>
          confirm(
            'Log out?',
            'Your Circle stays saved in your account. Log in again with this number to get it back.',
            'Log out',
            handleLogOut,
          )
        }
      />

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold" style={{ color: Brand.red }}>
          Delete my account
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Permanently deletes your account and everything stored about you: your name, your
          Circle, and all check-in and SOS history. This can&apos;t be undone.
          {checkIn ? ' Your active check-in will be cancelled and your Circle will not be alerted.' : ''}
        </ThemedText>
        <BigButton
          label={busy ? 'Please wait…' : 'Delete my account'}
          variant="danger"
          disabled={busy}
          onPress={() =>
            // Ask twice: this can't be undone.
            confirm('Delete your account?', 'Everything will be permanently deleted.', 'Continue', () =>
              confirm(
                'Are you absolutely sure?',
                'This cannot be undone.',
                'Delete everything',
                handleDelete,
              ),
            )
          }
        />
      </ThemedView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.four,
    gap: Spacing.two,
  },
  phone: {
    fontSize: 26,
    lineHeight: 34,
  },
});
