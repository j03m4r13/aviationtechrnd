import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus
} from 'expo-audio';

import AviationCallsignMonitor from '../../modules/aviation-callsign-monitor';
import { processAudio } from '../services/audio-processing-api';

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

type TranscriptUiState =
  | 'not_processed'
  | 'uploading'
  | 'completed'
  | 'failed';
type TranslationUiState =
  | 'waiting_for_transcript'
  | 'completed'
  | 'failed';

type FlightProcessingResult = {
  transcript: string;
  translation: string;
  cloudSessionId: string;
  transcriptionModel: string;
  translationModel: string;
  errorMessage?: string;
};

const SOURCE_LANGUAGE = 'en';
const TARGET_LANGUAGE = 'tl';

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

function sessionKeyOf(session: FlightSessionSummary): string {
  return session.sessionId ?? session.recordingFile ?? session.metadataFile ?? 'unknown';
}

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

function formatPlaybackTime(value: number | undefined): string {
  if (!value || Number.isNaN(value)) return '0:00';
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(value: number): string {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleString();
}

function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function durationForUpload(session: FlightSessionSummary): number {
  if (session.recordingDurationMs && session.recordingDurationMs > 0) {
    return session.recordingDurationMs;
  }

  if (
    session.startedAtEpochMs &&
    session.endedAtEpochMs &&
    session.endedAtEpochMs > session.startedAtEpochMs
  ) {
    return session.endedAtEpochMs - session.startedAtEpochMs;
  }

  return 1000;
}

function transcriptStatusText(status: TranscriptUiState): string {
  switch (status) {
    case 'uploading':
      return 'Uploading and processing after flight';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed - retry available';
    case 'not_processed':
    default:
      return 'Not processed';
  }
}

function translationStatusText(status: TranslationUiState): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'waiting_for_transcript':
    default:
      return 'Waiting for transcript';
  }
}

export function FlightRecorderPanel() {
  const [status, setStatus] = useState<FlightSessionStatus>(emptyStatus);
  const [sessions, setSessions] = useState<FlightSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [transcriptStates, setTranscriptStates] = useState<
    Record<string, TranscriptUiState>
  >({});
  const [translationStates, setTranslationStates] = useState<
    Record<string, TranslationUiState>
  >({});
  const [processingResults, setProcessingResults] = useState<
    Record<string, FlightProcessingResult>
  >({});
  const player = useAudioPlayer(null);
  const playbackStatus = useAudioPlayerStatus(player);

  async function refreshSessions() {
    const next = await AviationCallsignMonitor.listFlightSessions();
    setSessions(next as FlightSessionSummary[]);
  }

  async function refreshAll() {
    try {
      setBusy(true);
      const [nextStatus] = await Promise.all([
        AviationCallsignMonitor.getFlightSessionStatus(),
        refreshSessions()
      ]);
      setStatus(nextStatus as FlightSessionStatus);
    } catch (error) {
      Alert.alert(
        'Unable to refresh recorder',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    try {
      if (Platform.OS !== 'android') {
        Alert.alert('Android only', 'Flight recording is Android-only for now.');
        return;
      }

      setBusy(true);
      stopPlayback();

      const monitorStatus = await AviationCallsignMonitor.getStatus();
      if (!monitorStatus.initialized) {
        Alert.alert(
          'Models still loading',
          'Wait for the callsign monitor to show Ready before starting flight recording.'
        );
        return;
      }

      if (monitorStatus.monitoring) {
        Alert.alert(
          'Stop normal monitor first',
          'Stop normal callsign monitoring before starting flight recording. The flight recorder uses the shared microphone path.'
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
        'Unable to start flight recording',
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
      await refreshSessions();
    } catch (error) {
      Alert.alert(
        'Unable to stop flight recording',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  }

  async function playSession(session: FlightSessionSummary) {
    try {
      if (!session.recordingFile || !session.recordingExists) {
        Alert.alert('Recording unavailable', 'The audio file was not found.');
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true
      });

      player.pause();
      player.replace(toFileUri(session.recordingFile));
      player.seekTo(0);
      player.play();
      setPlayingSessionId(session.sessionId ?? session.recordingFile);
    } catch (error) {
      setPlayingSessionId(null);
      Alert.alert(
        'Unable to play recording',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  function stopPlayback() {
    player.pause();
    player.seekTo(0);
    setPlayingSessionId(null);
  }

  async function transcribeSession(session: FlightSessionSummary) {
    if (!session.recordingFile || !session.recordingExists) {
      Alert.alert('Recording unavailable', 'The audio file was not found.');
      return;
    }

    const key = sessionKeyOf(session);
    const durationMs = durationForUpload(session);

    try {
      setTranscriptStates((current) => ({
        ...current,
        [key]: 'uploading'
      }));
      setTranslationStates((current) => ({
        ...current,
        [key]: 'waiting_for_transcript'
      }));
      setProcessingResults((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      const response = await processAudio({
        uri: toFileUri(session.recordingFile),
        localSessionId: key,
        createdAt: new Date(session.startedAtEpochMs || Date.now()).toISOString(),
        durationMs,
        sourceLanguage: SOURCE_LANGUAGE,
        targetLanguage: TARGET_LANGUAGE,
        inputName: 'Flight Recorder',
        inputType: 'shared-audio-frame',
        idempotencyKey: `flight-transcribe-${key}`
      });

      setTranscriptStates((current) => ({
        ...current,
        [key]: 'completed'
      }));
      setTranslationStates((current) => ({
        ...current,
        [key]: 'completed'
      }));
      setProcessingResults((current) => ({
        ...current,
        [key]: {
          transcript: response.transcript,
          translation: response.translation,
          cloudSessionId: response.cloudSessionId,
          transcriptionModel: response.models.transcription,
          translationModel: response.models.translation
        }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTranscriptStates((current) => ({
        ...current,
        [key]: 'failed'
      }));
      setTranslationStates((current) => ({
        ...current,
        [key]: 'failed'
      }));
      setProcessingResults((current) => ({
        ...current,
        [key]: {
          transcript: '',
          translation: '',
          cloudSessionId: '',
          transcriptionModel: '',
          translationModel: '',
          errorMessage: message
        }
      }));
      Alert.alert('Transcription failed', message);
    }
  }

  function explainTranslation(session: FlightSessionSummary) {
    const key = sessionKeyOf(session);
    const result = processingResults[key];

    if (!result || !result.translation) {
      Alert.alert(
        'Transcript required first',
        'Press Transcribe first. Translation is returned after the post-flight transcription job completes.'
      );
      return;
    }

    Alert.alert('Translation', result.translation);
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    if (playbackStatus.didJustFinish) {
      setPlayingSessionId(null);
    }
  }, [playbackStatus.didJustFinish]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LOCAL FLIGHT AUDIO</Text>
          <Text style={styles.title}>Flight Recorder</Text>
          <Text style={styles.help}>
            Records the full session while the local callsign monitor listens on
            the same microphone stream. Transcription and translation happen
            after the flight when a connection is available.
          </Text>
        </View>
        <View style={[styles.statusPill, status.active && styles.statusPillActive]}>
          <Text style={[styles.statusPillText, status.active && styles.statusPillTextActive]}>
            {status.active ? 'REC' : 'READY'}
          </Text>
        </View>
      </View>

      <View style={styles.recorderBox}>
        <View style={styles.row}>
          <View style={[styles.statusDot, status.active && styles.statusDotActive]} />
          <Text style={styles.statusText}>
            {status.active ? 'Recording and detecting callsigns' : 'Recorder stopped'}
          </Text>
        </View>

        <Text style={styles.detail}>Current session: {status.sessionId ?? 'none'}</Text>
        <Text style={styles.detail}>
          Events this session: {status.eventCount} · Duration:{' '}
          {formatDuration(status.recordingDurationMs)} · Size:{' '}
          {formatBytes(status.recordingAudioBytes)}
        </Text>

        <View style={styles.mainActions}>
          <Pressable
            disabled={busy || status.active}
            onPress={() => void startSession()}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || busy || status.active) && styles.buttonPressed
            ]}
          >
            <Text style={styles.primaryButtonText}>Start Flight Recording</Text>
          </Pressable>

          <Pressable
            disabled={busy || !status.active}
            onPress={() => void stopSession()}
            style={({ pressed }) => [
              styles.stopButton,
              (pressed || busy || !status.active) && styles.buttonPressed
            ]}
          >
            <Text style={styles.stopButtonText}>Stop</Text>
          </Pressable>
        </View>
      </View>

      {playingSessionId ? (
        <View style={styles.playbackBar}>
          <Text style={styles.playbackText}>
            Playing {formatPlaybackTime(playbackStatus.currentTime)} /{' '}
            {formatPlaybackTime(playbackStatus.duration)}
          </Text>
          <Pressable onPress={stopPlayback} style={styles.stopPlaybackButton}>
            <Text style={styles.stopPlaybackText}>Stop Playback</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sessionsHeaderRow}>
        <Text style={styles.sectionTitle}>Saved recordings</Text>
        <Pressable
          disabled={busy}
          onPress={() => void refreshAll()}
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
          No saved sessions yet. Start and stop a flight recording first.
        </Text>
      ) : (
        sessions.map((session) => {
          const sessionKey = sessionKeyOf(session);
          const isPlaying = playingSessionId === (session.sessionId ?? session.recordingFile);
          const transcriptState = transcriptStates[sessionKey] ?? 'not_processed';
          const translationState =
            translationStates[sessionKey] ?? 'waiting_for_transcript';
          const processingResult = processingResults[sessionKey];
          const isProcessing = transcriptState === 'uploading';

          return (
            <View key={sessionKey} style={styles.sessionBox}>
              <View style={styles.sessionTitleRow}>
                <View style={styles.sessionTitleCopy}>
                  <Text style={styles.sessionTitle}>{session.sessionId ?? 'Unnamed session'}</Text>
                  <Text style={styles.sessionDate}>{formatDate(session.startedAtEpochMs)}</Text>
                </View>
                <Text style={styles.eventBadge}>{session.eventCount} events</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metric}>Duration: {formatDuration(session.recordingDurationMs)}</Text>
                <Text style={styles.metric}>Size: {formatBytes(session.recordingAudioBytes)}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metric}>
                  Format: {session.recordingContainer ?? 'unknown'} / {session.recordingCodec ?? 'unknown'}
                </Text>
                <Text style={session.recordingExists ? styles.existsText : styles.missingText}>
                  {session.recordingExists ? 'Audio found' : 'Audio missing'}
                </Text>
              </View>

              <View style={styles.processingBox}>
                <Text style={styles.processingTitle}>Post-flight processing</Text>
                <Text style={styles.processingText}>
                  Transcript: {transcriptStatusText(transcriptState)}
                </Text>
                <Text style={styles.processingText}>
                  Translation: {translationStatusText(translationState)}
                </Text>
                {processingResult?.errorMessage ? (
                  <Text style={styles.errorText}>{processingResult.errorMessage}</Text>
                ) : null}
              </View>

              <View style={styles.sessionActions}>
                <Pressable
                  disabled={!session.recordingExists || !session.recordingFile || isProcessing}
                  onPress={() => void playSession(session)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.playButton,
                    isPlaying && styles.playButtonActive,
                    (!session.recordingExists || !session.recordingFile || isProcessing || pressed) &&
                      styles.buttonPressed
                  ]}
                >
                  <Text style={styles.actionButtonText}>
                    {isPlaying ? 'Replay' : 'Play'}
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!session.recordingExists || !session.recordingFile || isProcessing}
                  onPress={() => void transcribeSession(session)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.transcribeButton,
                    (!session.recordingExists || !session.recordingFile || isProcessing || pressed) &&
                      styles.buttonPressed
                  ]}
                >
                  <Text style={styles.actionButtonText}>
                    {isProcessing ? 'Processing…' : 'Transcribe'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => explainTranslation(session)}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.translateButton,
                    pressed && styles.buttonPressed
                  ]}
                >
                  <Text style={styles.actionButtonText}>Translate</Text>
                </Pressable>
              </View>

              {processingResult?.transcript ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultTitle}>Transcript</Text>
                  <Text selectable numberOfLines={6} style={styles.resultText}>
                    {processingResult.transcript}
                  </Text>
                  <Text style={styles.modelText}>
                    {processingResult.transcriptionModel} → {processingResult.translationModel}
                  </Text>
                </View>
              ) : null}

              {processingResult?.translation ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultTitle}>Translation</Text>
                  <Text selectable numberOfLines={6} style={styles.resultText}>
                    {processingResult.translation}
                  </Text>
                </View>
              ) : null}

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
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  headerCopy: {
    flex: 1,
    gap: 5
  },
  eyebrow: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1
  },
  title: {
    color: '#f8fafc',
    fontSize: 23,
    fontWeight: '900'
  },
  help: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19
  },
  statusPill: {
    backgroundColor: '#1e293b',
    borderColor: '#475569',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusPillActive: {
    backgroundColor: '#3b0a0a',
    borderColor: '#ef4444'
  },
  statusPillText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '900'
  },
  statusPillTextActive: {
    color: '#fecaca'
  },
  recorderBox: {
    backgroundColor: '#111c2e',
    borderColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 13
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
    backgroundColor: '#ef4444'
  },
  statusText: {
    color: '#e2e8f0',
    fontWeight: '800'
  },
  detail: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17
  },
  mainActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12
  },
  primaryButtonText: {
    color: '#eff6ff',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center'
  },
  stopButton: {
    alignItems: 'center',
    backgroundColor: '#991b1b',
    borderRadius: 12,
    flex: 0.45,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12
  },
  stopButtonText: {
    color: '#fee2e2',
    fontSize: 13,
    fontWeight: '900'
  },
  buttonPressed: {
    opacity: 0.55
  },
  playbackBar: {
    alignItems: 'center',
    backgroundColor: '#0f1f36',
    borderColor: '#1d4ed8',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 10
  },
  playbackText: {
    color: '#bfdbfe',
    flex: 1,
    fontSize: 12,
    fontWeight: '700'
  },
  stopPlaybackButton: {
    backgroundColor: '#991b1b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  stopPlaybackText: {
    color: '#fee2e2',
    fontSize: 12,
    fontWeight: '800'
  },
  sessionsHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  sectionTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '900'
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
    gap: 7,
    padding: 12
  },
  sessionTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between'
  },
  sessionTitleCopy: {
    flex: 1,
    gap: 3
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
  eventBadge: {
    backgroundColor: '#172554',
    borderColor: '#1d4ed8',
    borderRadius: 999,
    borderWidth: 1,
    color: '#bfdbfe',
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4
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
  processingBox: {
    backgroundColor: '#111827',
    borderColor: '#293548',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    marginTop: 4,
    padding: 10
  },
  processingTitle: {
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: '900'
  },
  processingText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 17
  },
  sessionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 9,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  playButton: {
    backgroundColor: '#2563eb'
  },
  playButtonActive: {
    backgroundColor: '#1d4ed8'
  },
  transcribeButton: {
    backgroundColor: '#0f766e'
  },
  translateButton: {
    backgroundColor: '#6d28d9'
  },
  actionButtonText: {
    color: '#eff6ff',
    fontSize: 12,
    fontWeight: '800'
  },
  resultBox: {
    backgroundColor: '#101826',
    borderColor: '#334155',
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    marginTop: 4,
    padding: 10
  },
  resultTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '900'
  },
  resultText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18
  },
  modelText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 15
  },
  pathText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 15
  }
});
