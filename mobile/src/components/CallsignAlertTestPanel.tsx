import { Alert, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import AviationCallsignMonitor from '../../modules/aviation-callsign-monitor';

export function CallsignAlertTestPanel() {
  async function runTest(confirmed: boolean) {
    try {
      await AviationCallsignMonitor.testAlert(confirmed);
      Vibration.vibrate(
        confirmed ? [0, 120, 80, 120] : [0, 220, 100, 340]
      );
    } catch (error) {
      Alert.alert(
        'Alert test failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Alert output test</Text>
      <Text style={styles.help}>
        Raise the phone media volume, then test the sound and vibration without
        waiting for a callsign detection.
      </Text>

      <View style={styles.row}>
        <Pressable
          onPress={() => void runTest(false)}
          style={({ pressed }) => [
            styles.button,
            styles.possibleButton,
            pressed && styles.pressed
          ]}
        >
          <Text style={styles.possibleText}>Test possible alert</Text>
        </Pressable>

        <Pressable
          onPress={() => void runTest(true)}
          style={({ pressed }) => [
            styles.button,
            styles.confirmedButton,
            pressed && styles.pressed
          ]}
        >
          <Text style={styles.confirmedText}>Test confirmed alert</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>
        Sound uses Android media volume. Vibration requires the rebuilt app to
        include the Android VIBRATE permission.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111923',
    borderColor: '#293347',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  title: {
    color: '#f0f4f9',
    fontSize: 17,
    fontWeight: '800'
  },
  help: {
    color: '#9dacbf',
    fontSize: 12,
    lineHeight: 18
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  button: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 10
  },
  possibleButton: {
    backgroundColor: '#78350f',
    borderColor: '#f59e0b',
    borderWidth: 1
  },
  confirmedButton: {
    backgroundColor: '#14532d',
    borderColor: '#22c55e',
    borderWidth: 1
  },
  possibleText: {
    color: '#fde68a',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  confirmedText: {
    color: '#bbf7d0',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  pressed: {
    opacity: 0.75
  },
  note: {
    color: '#74839a',
    fontSize: 11,
    lineHeight: 16
  }
});
