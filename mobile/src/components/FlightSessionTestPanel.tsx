import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { requestRecordingPermissionsAsync } from 'expo-audio';

import AviationCallsignMonitor from '../../modules/aviation-callsign-monitor';

type FlightSessionStatus = {
  active: boolean;
  sessionId: string | null;
  recordingFile: string | null;
  recordingContainer: string | null;
  recordingCodec: string | null;
  recordingSampleRate: number | null;
  recordingChannels: number | null;
  recordingDurationMs: number | null;
  recordingAudioBytes: number | null;
  metadataFile: string | null;
  eventCount: number;
  message?: string | null;
};

const emptyStatus: FlightSessionStatus = {
  active: false,
  sessionId: null,
  recordingFile: null,
  recordingContainer: null,
  recordingCodec: null,
  recordingSampleRate: null,
  recordingChannels: null,
  recordingDurationMs: null,
  recordingAudioBytes: null,
  metadataFile: null,
  eventCount: 0,
  message: null
};

function formatBytes(value: number | null): string {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(value: number | null): string {
  if (!value) return '0s';
  return `${Math.round(value / 1000)}s`;
}

export function FlightSessionTestPanel() {
  const [status, setStatus] = useState<FlightSessionStatus>(emptyStatus);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const next = await AviationCallsignMonitor.getFlightSessionStatus();
    setStatus(next as FlightSessionStatus);
  }

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, []);

  async function startSession() {
    try {
      if (Platform.OS !== 'android') {
        Alert.alert('Android only', 'Flight session capture is Android-only for now.');
        return;
      }

      setBusy(true);
      const monitorStatus = await AviationCallsignMonitor.getStatus();
      if (!monitorStatus.initialized) {
        Alert.alert(
          'Models still loading',
          'Wait for the callsign monitor to show Ready before starting a flight session.'
        );
        return;
      }

      if (monitorStatus.monitoring) {
        Alert.alert(
          'Stop monitor first',
          'Stop normal callsign monitoring before starting the shared flight session test.'
        );
        return;
      }

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone required', 'Enable microphone access first.');
        return;
      }

      const next = await AviationCallsignMonitor.startFlightSession();
      setStatus(next as FlightSessionStatus);
    } catch (error) {
      Alert.alert(
        'Unable to start flight session',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  }

  async function stopSession() {
    try {
      setBusy(true);
      const next = await AviationCallsignMonitor.stopFlightSession();
      setStatus(next as FlightSessionStatus);
    } catch (error) {
      Alert.alert(
        'Unable to stop flight session',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Flight session test</Text>
      <Text style={styles.help}>
        Starts one shared microphone capture that records the full session and
        feeds the same audio into local callsign detection.
      </Text>

      <View style={styles.row}>
        <View
          style={[
            styles.statusDot,
            status.active && styles.statusDotActive
          ]}
        />
        <Text style={styles.statusText}>
          {status.active ? 'Recording + detecting' : 'Stopped'}
        </Text>
      </View>

      <Text style={styles.detail}>Session: {status.sessionId ?? 'none'}</Text>
      <Text style={styles.detail}>Events: {status.eventCount}</Text>
      <Text style={styles.detail}>
        Format: {status.recordingContainer ?? 'none'} / {status.recordingCodec ?? 'none'}
      </Text>
      <Text style={styles.detail}>
        Duration: {formatDuration(status.recordingDurationMs)} · Size:{' '}
        {formatBytes(status.recordingAudioBytes)}
      </Text>

      {status.recordingFile ? (
        <Text numberOfLines={2} style={styles.path}>
          Audio: {status.recordingFile}
        </Text>
      ) : null}

      {status.metadataFile ? (
        <Text numberOfLines={2} style={styles.path}>
          Metadata: {status.metadataFile}
        </Text>
      ) : null}

      <View style={styles.buttonRow}>
        <Pressable
          disabled={busy || status.active}
          onPress={() => void startSession()}
          style={({ pressed }) => [
            styles.button,
            (pressed || busy || status.active) && styles.buttonPressed
          ]}
        >
          <Text style={styles.buttonText}>Start Flight Session</Text>
        </Pressable>

        <Pressable
          disabled={busy || !status.active}
          onPress={() => void stopSession()}
          style={({ pressed }) => [
            styles.button,
            styles.stopButton,
            (pressed || busy || !status.active) && styles.buttonPressed
          ]}
        >
          <Text style={styles.buttonText}>Stop</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={busy}
        onPress={() => void refresh()}
        style={({ pressed }) => [styles.refreshButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.refreshText}>Refresh session status</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111923',
    borderColor: '#293347',
    borderRadius: 14,
    borderWidth: 1,
    gap: 9,
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
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
    fontWeight: '700'
  },
  detail: {
    color: '#cbd5e1',
    fontSize: 12
  },
  path: {
    color: '#74839a',
    fontSize: 11,
    lineHeight: 16
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 10
  },
  stopButton: {
    backgroundColor: '#991b1b',
    flex: 0.55
  },
  buttonPressed: {
    opacity: 0.55
  },
  buttonText: {
    color: '#eff6ff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  refreshButton: {
    alignItems: 'center',
    borderColor: '#334155',
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10
  },
  refreshText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '700'
  }
});
