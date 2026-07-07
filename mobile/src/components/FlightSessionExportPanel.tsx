import { requireNativeModule } from 'expo-modules-core';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import AviationCallsignMonitor from '../../modules/aviation-callsign-monitor';

type NativeExportModule = {
  shareFlightSessionFile(
    path: string,
    mimeType: string,
    title: string
  ): Promise<{ success: boolean }>;
};

type FlightSessionSummary = {
  sessionId: string | null;
  startedAtEpochMs: number;
  recordingFile: string | null;
  recordingExists: boolean;
  metadataFile: string | null;
  transcriptFile?: string | null;
  translationFile?: string | null;
  transcriptText?: string | null;
  translationText?: string | null;
};

const NativeExport = requireNativeModule<NativeExportModule>(
  'AviationCallsignMonitor'
);

function formatDate(value: number): string {
  return value ? new Date(value).toLocaleString() : 'Unknown date';
}

async function exportFile(
  path: string | null | undefined,
  mimeType: string,
  title: string
) {
  if (!path) {
    Alert.alert('Nothing to export', 'This file is not available yet.');
    return;
  }

  try {
    await NativeExport.shareFlightSessionFile(path, mimeType, title);
  } catch (error) {
    Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
  }
}

export function FlightSessionExportPanel() {
  const [sessions, setSessions] = useState<FlightSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setBusy(true);
      const next = await AviationCallsignMonitor.listFlightSessions();
      setSessions(next as FlightSessionSummary[]);
    } catch (error) {
      Alert.alert(
        'Unable to load exports',
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
          <Text style={styles.title}>Flight exports</Text>
          <Text style={styles.help}>
            Share audio, metadata, transcript, and translation files from saved
            flight sessions.
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
        <Text style={styles.emptyText}>No saved flight sessions yet.</Text>
      ) : (
        sessions.map((session) => {
          const id = session.sessionId ?? session.recordingFile ?? 'flight-session';
          const hasTranscript = Boolean(session.transcriptFile || session.transcriptText);
          const hasTranslation = Boolean(session.translationFile || session.translationText);

          return (
            <View key={id} style={styles.sessionBox}>
              <Text style={styles.sessionTitle}>{session.sessionId ?? 'Unnamed session'}</Text>
              <Text style={styles.sessionDate}>{formatDate(session.startedAtEpochMs)}</Text>

              <View style={styles.statusRow}>
                <Text style={session.recordingExists ? styles.goodText : styles.badText}>
                  {session.recordingExists ? 'Audio ready' : 'Audio missing'}
                </Text>
                <Text style={hasTranscript ? styles.goodText : styles.mutedText}>
                  {hasTranscript ? 'Transcript ready' : 'No transcript yet'}
                </Text>
                <Text style={hasTranslation ? styles.goodText : styles.mutedText}>
                  {hasTranslation ? 'Translation ready' : 'No translation yet'}
                </Text>
              </View>

              <View style={styles.actions}>
                <Pressable
                  disabled={!session.recordingFile || !session.recordingExists}
                  onPress={() =>
                    void exportFile(session.recordingFile, 'audio/wav', `Export audio - ${id}`)
                  }
                  style={({ pressed }) => [
                    styles.actionButton,
                    (!session.recordingFile || !session.recordingExists || pressed) &&
                      styles.buttonPressed
                  ]}
                >
                  <Text style={styles.actionText}>Export Audio</Text>
                </Pressable>

                <Pressable
                  disabled={!session.metadataFile}
                  onPress={() =>
                    void exportFile(session.metadataFile, 'application/json', `Export metadata - ${id}`)
                  }
                  style={({ pressed }) => [
                    styles.actionButton,
                    (!session.metadataFile || pressed) && styles.buttonPressed
                  ]}
                >
                  <Text style={styles.actionText}>Export Metadata</Text>
                </Pressable>

                <Pressable
                  disabled={!session.transcriptFile}
                  onPress={() =>
                    void exportFile(session.transcriptFile, 'application/json', `Export transcript - ${id}`)
                  }
                  style={({ pressed }) => [
                    styles.actionButton,
                    (!session.transcriptFile || pressed) && styles.buttonPressed
                  ]}
                >
                  <Text style={styles.actionText}>Export Transcript</Text>
                </Pressable>

                <Pressable
                  disabled={!session.translationFile}
                  onPress={() =>
                    void exportFile(session.translationFile, 'application/json', `Export translation - ${id}`)
                  }
                  style={({ pressed }) => [
                    styles.actionButton,
                    (!session.translationFile || pressed) && styles.buttonPressed
                  ]}
                >
                  <Text style={styles.actionText}>Export Translation</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderColor: '#334155',
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 16
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
    fontSize: 18,
    fontWeight: '900'
  },
  help: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18
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
    opacity: 0.5
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12
  },
  sessionBox: {
    backgroundColor: '#0b1220',
    borderColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
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
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  goodText: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '700'
  },
  badText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '700'
  },
  mutedText: {
    color: '#94a3b8',
    fontSize: 12
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  actionButton: {
    backgroundColor: '#475569',
    borderRadius: 9,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  actionText: {
    color: '#eff6ff',
    fontSize: 12,
    fontWeight: '800'
  }
});
