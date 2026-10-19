import { Pressable, StyleSheet, Text } from 'react-native';

import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BigButtonProps = {
  label: string;
  onPress: () => void;
  // "primary" = green, "danger" = red, "plain" = grey
  variant?: 'primary' | 'danger' | 'plain';
  disabled?: boolean;
};

/** A large, easy-to-tap button used across the app. */
export function BigButton({ label, onPress, variant = 'primary', disabled }: BigButtonProps) {
  const theme = useTheme();

  const background =
    variant === 'primary' ? Brand.green : variant === 'danger' ? Brand.red : theme.backgroundElement;
  const textColor = variant === 'plain' ? theme.text : Brand.onColor;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // `pressed` is true while your finger is on the button, so it dims slightly.
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <Text style={[styles.label, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
    alignItems: 'center',
  },
  label: {
    fontSize: 17,
    fontWeight: 700,
  },
  dimmed: {
    opacity: 0.5,
  },
});
