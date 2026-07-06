import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import AviationCallsignMonitor from '../../modules/aviation-callsign-monitor';

type FlightSessionSummary = {
  sessionId: string | null;
  startedAtEpochMs: number;
  endedAtEpochMs: number | null;
  recordingFile: string | null;
  recordingExists: boolean;
  recordingContainer: string | null;
  recordingCodec: string | null;
  recordingSampleRate: number | null;
  recordingChannels: number | null;
  recordingDurationMs: number | null;
  recordingAudioBytes: number | null;
  metadataFile: string | null;
  eventCount: number;
};

function formatBytes(value: number | null): string {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(value: number | null): string {
  if (!value) return '0s';
  const seconds = Math.round(value / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(value: number): string {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleString();
}

export function SavedFlightSessionsPanel() {
  const [sessions, setSessions] = useState<FlightSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setBusy(true);
      const next = await AviationCallsignMonitor.listFlightSessions();
      setSessions(next as FlightSessionSummary[]);
    } catch (error) {
      Alert.alert(
        'Unable to load sessions',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Saved flight sessions</Text>
          <Text style={styles.help}>
            Local recordings and callsign metadata saved on this device.
          </Text>
        </View>
        <Pressable
          disabled={busy}
          onPress={() => void refresh()}
          style={({ pressed }) => [
            styles.refreshButton,
            (pressed || busy) && styles.buttonPressed
          ]}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {sessions.length === 0 ? (
        <Text style={styles.emptyText}>
          No saved sessions yet. Start and stop a flight session first.
        </Text>
      ) : (
        sessions.map((session) => (
          <View key={session.sessionId ?? session.metadataFile ?? Math.random()} style={styles.sessionBox}>
            <Text style={styles.sessionTitle}>{session.sessionId ?? 'Unnamed session'}</Text>
            <Text style={styles.sessionDate}>{formatDate(session.startedAtEpochMs)}</Text>

            <View style={styles.metricRow}>
              <Text style={styles.metric}>Duration: {formatDuration(session.recordingDurationMs)}</Text>
              <Text style={styles.metric}>Size: {formatBytes(session.recordingAudioBytes)}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metric}>Events: {session.eventCount}</Text>
              <Text style={styles.metric}>
                Format: {session.recordingContainer ?? 'unknown'} / {session.recordingCodec ?? 'unknown'}
              </Text>
            </View>

            <Text style={session.recordingExists ? styles.existsText : styles.missingText}>
              {session.recordingExists ? 'Audio file found' : 'Audio file missing'}
            </Text>

            {session.recordingFile ? (
              <Text numberOfLines={2} style={styles.pathText}>
                Audio: {session.recordingFile}
              </Text>
            ) : null}

            {session.metadataFile ? (
              <Text numberOfLines={2} style={styles.pathText}>
                Metadata: {session.metadataFile}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 14
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  headerCopy: {
    flex: 1,
    gap: 4
  },
  title: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800'
  },
  help: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17
  },
  refreshButton: {
    borderColor: '#3b82f6',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  refreshText: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '800'
  },
  buttonPressed: {
    opacity: 0.55
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18
  },
  sessionBox: {
    backgroundColor: '#0b1220',
    borderColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  sessionTitle: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '800'
  },
  sessionDate: {
    color: '#94a3b8',
    fontSize: 12
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  metric: {
    color: '#cbd5e1',
    fontSize: 12
  },
  existsText: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '700'
  },
  missingText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '700'
  },
  pathText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 15
  }
});
