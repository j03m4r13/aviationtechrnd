import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  danger = false
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        danger ? styles.danger : styles.normal,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#111827" />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 13,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18
  },
  normal: {
    backgroundColor: '#d6e7ff'
  },
  danger: {
    backgroundColor: '#ffb8b8'
  },
  disabled: {
    opacity: 0.45
  },
  pressed: {
    transform: [{ scale: 0.99 }]
  },
  label: {
    color: '#142033',
    fontSize: 15,
    fontWeight: '800'
  }
});
