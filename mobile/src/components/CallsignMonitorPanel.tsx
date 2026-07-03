import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Vibration,
  View
} from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';

import AviationCallsignMonitor, {
  useCallsignMonitor
} from '../../modules/aviation-callsign-monitor';
import BluetoothAudioRoute from '../../modules/bluetooth-audio-route';

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  if (await PermissionsAndroid.check(permission)) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: 'Bluetooth headset access',
    message:
      'Aviation Voice needs Bluetooth access to route cockpit audio through a compatible headset microphone.',
    buttonPositive: 'Allow',
    buttonNegative: 'Cancel'
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function CallsignMonitorPanel() {
  const [callsign, setCallsign] = useState('N734AB');
  const [aliasText, setAliasText] = useState('three four alpha bravo');
  const [useBluetooth, setUseBluetooth] = useState(false);

  const aliases = useMemo(
    () =>
      aliasText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    [aliasText]
  );
  const config = useMemo(() => ({ callsign, aliases }), [callsign, aliases]);
  const monitor = useCallsignMonitor(config);

  useEffect(() => {
    const alert = monitor.lastAlert;
    if (!alert?.notify) {
      return;
    }

    Vibration.vibrate([0, 180, 100, 300]);
  }, [monitor.lastAlert]);

  useEffect(() => {
    if (!monitor.lastAlert) {
      return;
    }

    const timeout = setTimeout(monitor.clearAlert, 8_000);
    return () => clearTimeout(timeout);
  }, [monitor.clearAlert, monitor.lastAlert]);

  useEffect(() => {
    return () => {
      void AviationCallsignMonitor.stopMonitoring()
        .catch(() => undefined)
        .finally(() =>
          BluetoothAudioRoute.stopBluetoothRoute().catch(() => undefined)
        );
    };
  }, []);

  async function start() {
    try {
      if (Platform.OS !== 'android') {
        Alert.alert(
          'Android only',
          'Offline callsign monitoring is currently implemented for Android.'
        );
        return;
      }

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Microphone required',
          'Enable microphone access to monitor cockpit audio.'
        );
        return;
      }

      if (useBluetooth) {
        if (!(await requestBluetoothPermission())) {
          throw new Error('Bluetooth permission was not granted.');
        }

        const route = await BluetoothAudioRoute.startBluetoothRoute();
        if (!route.success) {
          throw new Error(
            route.message ||
              'Android could not activate the Bluetooth headset microphone.'
          );
        }

        await sleep(700);
      } else {
        await BluetoothAudioRoute.stopBluetoothRoute();
      }

      await monitor.start();
    } catch (error) {
      await BluetoothAudioRoute.stopBluetoothRoute().catch(() => undefined);
      Alert.alert(
        'Unable to start',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async function stop() {
    try {
      await monitor.stop();
    } finally {
      await BluetoothAudioRoute.stopBluetoothRoute().catch(() => undefined);
    }
  }

  const alertActive = Boolean(monitor.lastAlert);

  return (
    <View style={[styles.card, alertActive && styles.alertCard]}>
      <Text style={styles.title}>Offline Callsign Monitor</Text>
      <Text style={styles.subtitle}>
        Vosk listens continuously; Whisper checks every completed transmission.
      </Text>

      <Text style={styles.label}>Aircraft callsign</Text>
      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!monitor.status.monitoring}
        onChangeText={setCallsign}
        placeholder="N734AB"
        placeholderTextColor="#64748b"
        style={styles.input}
        value={callsign}
      />

      <Text style={styles.label}>Spoken aliases, separated by commas</Text>
      <TextInput
        autoCorrect={false}
        editable={!monitor.status.monitoring}
        onChangeText={setAliasText}
        placeholder="three four alpha bravo"
        placeholderTextColor="#64748b"
        style={styles.input}
        value={aliasText}
      />

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>Route through Bluetooth headset</Text>
          <Text style={styles.switchHelp}>
            Leave off for the phone microphone or an active USB audio input.
          </Text>
        </View>
        <Switch
          disabled={monitor.status.monitoring || monitor.busy}
          onValueChange={setUseBluetooth}
          value={useBluetooth}
        />
      </View>

      <View style={styles.row}>
        <View
          style={[
            styles.statusDot,
            monitor.status.monitoring && styles.statusDotActive
          ]}
        />
        <Text style={styles.statusText}>
          {monitor.status.monitoring
            ? 'Listening offline'
            : monitor.status.initialized
              ? 'Ready'
              : 'Models not loaded'}
        </Text>
      </View>

      {monitor.status.initialized ? (
        <Text style={styles.modelText}>
          Vosk: {monitor.status.voskModel ?? 'unknown'} · Whisper:{' '}
          {monitor.status.whisperModel ?? 'unknown'}
        </Text>
      ) : null}

      {monitor.lastTranscript ? (
        <Text numberOfLines={3} style={styles.transcript}>
          {monitor.lastTranscript.source}: {monitor.lastTranscript.transcript}
        </Text>
      ) : null}

      {monitor.lastAlert ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>
            CALLSIGN DETECTED: {monitor.lastAlert.target}
          </Text>
          <Text style={styles.alertText}>
            {monitor.lastAlert.source} ·{' '}
            {(monitor.lastAlert.score * 100).toFixed(0)}%
            {monitor.lastAlert.confirmed ? ' · CONFIRMED' : ''}
          </Text>
          <Text numberOfLines={3} style={styles.alertText}>
            {monitor.lastAlert.transcript}
          </Text>
        </View>
      ) : null}

      {monitor.error ? (
        <Text style={styles.error}>
          {monitor.error.code}: {monitor.error.message}
        </Text>
      ) : null}

      <Pressable
        disabled={monitor.busy}
        onPress={() => void (monitor.status.monitoring ? stop() : start())}
        style={({ pressed }) => [
          styles.button,
          monitor.status.monitoring && styles.stopButton,
          pressed && styles.buttonPressed,
          monitor.busy && styles.buttonDisabled
        ]}
      >
        <Text style={styles.buttonText}>
          {monitor.busy
            ? 'Working…'
            : monitor.status.monitoring
              ? 'Stop Monitoring'
              : 'Start Monitoring'}
        </Text>
      </Pressable>

      <Text style={styles.ownershipWarning}>
        The monitor owns the microphone while active. Stop it before returning
        to recording and translation.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16
  },
  alertCard: {
    borderColor: '#f59e0b',
    borderWidth: 3
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700'
  },
  subtitle: {
    color: '#94a3b8',
    lineHeight: 19,
    marginBottom: 6
  },
  label: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4
  },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#475569',
    borderRadius: 10,
    borderWidth: 1,
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  switchRow: {
    alignItems: 'center',
    backgroundColor: '#111c2e',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 6,
    padding: 12
  },
  switchCopy: {
    flex: 1,
    gap: 3
  },
  switchTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700'
  },
  switchHelp: {
    color: '#8493a8',
    fontSize: 11,
    lineHeight: 16
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginVertical: 6
  },
  statusDot: {
    backgroundColor: '#64748b',
    borderRadius: 5,
    height: 10,
    width: 10
  },
  statusDotActive: {
    backgroundColor: '#22c55e'
  },
  statusText: {
    color: '#e2e8f0',
    fontWeight: '600'
  },
  modelText: {
    color: '#74839a',
    fontSize: 11
  },
  transcript: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17
  },
  alertBox: {
    backgroundColor: '#451a03',
    borderRadius: 10,
    padding: 12
  },
  alertTitle: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: '800'
  },
  alertText: {
    color: '#fed7aa',
    marginTop: 3
  },
  error: {
    color: '#fca5a5'
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    marginTop: 8,
    paddingVertical: 12
  },
  stopButton: {
    backgroundColor: '#b91c1c'
  },
  buttonPressed: {
    opacity: 0.8
  },
  buttonDisabled: {
    opacity: 0.5
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700'
  },
  ownershipWarning: {
    color: '#8493a8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4
  }
});
