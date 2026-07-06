import { useEffect, useMemo, useRef, useState } from 'react';
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
import * as SecureStore from 'expo-secure-store';

import AviationCallsignMonitor, {
  useCallsignMonitor
} from '../../modules/aviation-callsign-monitor';
import type { CallsignAlertEvent } from '../../modules/aviation-callsign-monitor';
import BluetoothAudioRoute from '../../modules/bluetooth-audio-route';

const CALLSIGN_PREFERENCES_KEY = 'callsign-monitor-preferences-v1';
const DEFAULT_CALLSIGN = 'N734AB';
const DEFAULT_ALIASES = 'three four alpha bravo';

type SavedCallsignPreferences = {
  callsign: string;
  aliasText: string;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isConfirmedAlert(alert: CallsignAlertEvent | null): boolean {
  return Boolean(
    alert &&
      (alert.confirmed || alert.source === 'WHISPER' || alert.source === 'BOTH')
  );
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
  const [callsign, setCallsign] = useState(DEFAULT_CALLSIGN);
  const [aliasText, setAliasText] = useState(DEFAULT_ALIASES);
  const [useBluetooth, setUseBluetooth] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const preparedInitialConfig = useRef(false);

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
  const alertConfirmed = isConfirmedAlert(monitor.lastAlert);

  useEffect(() => {
    let active = true;

    void SecureStore.getItemAsync(CALLSIGN_PREFERENCES_KEY)
      .then((savedValue) => {
        if (!active || !savedValue) {
          return;
        }

        const saved = JSON.parse(savedValue) as Partial<SavedCallsignPreferences>;
        if (typeof saved.callsign === 'string' && saved.callsign.trim()) {
          setCallsign(saved.callsign.trim().toUpperCase());
        }
        if (typeof saved.aliasText === 'string') {
          setAliasText(saved.aliasText);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setPreferencesLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) {
      return;
    }

    const timeout = setTimeout(() => {
      const preferences: SavedCallsignPreferences = {
        callsign: callsign.trim().toUpperCase(),
        aliasText
      };

      void SecureStore.setItemAsync(
        CALLSIGN_PREFERENCES_KEY,
        JSON.stringify(preferences)
      ).catch(() => undefined);
    }, 250);

    return () => clearTimeout(timeout);
  }, [aliasText, callsign, preferencesLoaded]);

  useEffect(() => {
    if (
      !preferencesLoaded ||
        preparedInitialConfig.current ||
        monitor.status.monitoring ||
        !callsign.trim()
    ) {
      return;
    }

    preparedInitialConfig.current = true;
    const timeout = setTimeout(() => {
      void monitor.prepare().catch(() => undefined);
    }, 250);

    return () => clearTimeout(timeout);
  }, [callsign, monitor, preferencesLoaded]);

  useEffect(() => {
    const alert = monitor.lastAlert;
    if (!alert?.notify) {
      return;
    }

    if (isConfirmedAlert(alert)) {
      Vibration.vibrate([0, 120, 80, 120]);
    } else {
      Vibration.vibrate([0, 220, 100, 340]);
    }
  }, [monitor.lastAlert]);

  useEffect(() => {
    if (!monitor.lastAlert) {
      return;
    }

    const timeout = setTimeout(
      monitor.clearAlert,
      alertConfirmed ? 3_000 : 8_000
    );
    return () => clearTimeout(timeout);
  }, [alertConfirmed, monitor.clearAlert, monitor.lastAlert]);

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

      const normalizedCallsign = callsign.trim().toUpperCase();
      if (!normalizedCallsign) {
        Alert.alert('Callsign required', 'Enter the aircraft callsign first.');
        return;
      }
      setCallsign(normalizedCallsign);

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
  const confirmationDetail =
    monitor.lastAlert?.source === 'BOTH'
      ? 'Vosk + Whisper agreement'
      : 'Verified by Whisper';

  return (
    <View
      style={[
        styles.card,
        alertActive &&
          (alertConfirmed
            ? styles.alertCardConfirmed
            : styles.alertCardPossible)
      ]}
    >
      <Text style={styles.title}>Offline Callsign Monitor</Text>
      <Text style={styles.subtitle}>
        Vosk gives an immediate attention alert; Whisper then verifies the
        detected callsign.
      </Text>

      <Text style={styles.label}>Aircraft callsign</Text>
      <TextInput
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!monitor.status.monitoring}
        onChangeText={setCallsign}
        placeholder={DEFAULT_CALLSIGN}
        placeholderTextColor="#64748b"
        style={styles.input}
        value={callsign}
      />

      <Text style={styles.label}>Spoken aliases, separated by commas</Text>
      <TextInput
        autoCorrect={false}
        editable={!monitor.status.monitoring}
        onChangeText={setAliasText}
        placeholder={DEFAULT_ALIASES}
        placeholderTextColor="#64748b"
        style={styles.input}
        value={aliasText}
      />

      <Text style={styles.savedText}>
        Callsign and spoken aliases are saved automatically on this device.
      </Text>

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
            : monitor.busy
              ? 'Loading offline models…'
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
        <View
          style={[
            styles.alertBox,
            alertConfirmed
              ? styles.alertBoxConfirmed
              : styles.alertBoxPossible
          ]}
        >
          <View style={styles.alertHeaderRow}>
            <Text
              style={[
                styles.alertStage,
                alertConfirmed
                  ? styles.alertStageConfirmed
                  : styles.alertStagePossible
              ]}
            >
              {alertConfirmed ? 'CONFIRMED' : 'POSSIBLE'}
            </Text>
            <Text
              style={[
                styles.alertConfidence,
                alertConfirmed
                  ? styles.alertTextConfirmed
                  : styles.alertTextPossible
              ]}
            >
              {(monitor.lastAlert.score * 100).toFixed(0)}%
            </Text>
          </View>

          <Text
            style={[
              styles.alertTitle,
              alertConfirmed
                ? styles.alertTitleConfirmed
                : styles.alertTitlePossible
            ]}
          >
            {alertConfirmed ? 'CALLSIGN CONFIRMED' : 'POSSIBLE CALLSIGN'}:{' '}
            {monitor.lastAlert.target}
          </Text>

          <Text
            style={[
              styles.alertText,
              alertConfirmed
                ? styles.alertTextConfirmed
                : styles.alertTextPossible
            ]}
          >
            {alertConfirmed
              ? confirmationDetail
              : `Immediate Vosk alert · Whisper ${
                  monitor.status.whisperState === 'queued'
                    ? 'verification queued'
                    : monitor.status.whisperState === 'capturing'
                      ? 'is capturing the transmission'
                      : 'verification pending'
                }`}
          </Text>

          <Text
            numberOfLines={3}
            style={[
              styles.alertText,
              alertConfirmed
                ? styles.alertTextConfirmed
                : styles.alertTextPossible
            ]}
          >
            Heard: {monitor.lastAlert.transcript}
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
        The normal monitor owns the microphone while active. The flight session
        test uses the shared microphone path instead.
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
  alertCardPossible: {
    borderColor: '#f59e0b',
    borderWidth: 3
  },
  alertCardConfirmed: {
    borderColor: '#22c55e',
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
  savedText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16
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
    color: '#8fb2d9',
    fontSize: 12
  },
  transcript: {
    backgroundColor: '#111827',
    borderRadius: 10,
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
    padding: 10
  },
  alertBox: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  alertBoxPossible: {
    backgroundColor: '#2a1a05',
    borderColor: '#f59e0b'
  },
  alertBoxConfirmed: {
    backgroundColor: '#052e1a',
    borderColor: '#22c55e'
  },
  alertHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  alertStage: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1
  },
  alertStagePossible: {
    color: '#fbbf24'
  },
  alertStageConfirmed: {
    color: '#86efac'
  },
  alertConfidence: {
    fontSize: 13,
    fontWeight: '800'
  },
  alertTitle: {
    fontSize: 17,
    fontWeight: '900'
  },
  alertTitlePossible: {
    color: '#fde68a'
  },
  alertTitleConfirmed: {
    color: '#bbf7d0'
  },
  alertText: {
    fontSize: 13,
    lineHeight: 18
  },
  alertTextPossible: {
    color: '#fed7aa'
  },
  alertTextConfirmed: {
    color: '#dcfce7'
  },
  error: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 18
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 4
  },
  stopButton: {
    backgroundColor: '#b91c1c'
  },
  buttonPressed: {
    opacity: 0.75
  },
  buttonDisabled: {
    opacity: 0.55
  },
  buttonText: {
    color: '#eff6ff',
    fontWeight: '800'
  },
  ownershipWarning: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4
  }
});
