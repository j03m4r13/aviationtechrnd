import { requireNativeModule } from 'expo-modules-core';
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
  ownerUserId?: string | null;
  sessionId: string | null;
  recordingFile: string | null;
  recordingDurationMs: number | null;
  recordingAudioBytes: number | null;
  eventCount: number;
};

type FlightSessionSummary = {
  ownerUserId?: string | null;
  sessionId: string | null;
  startedAtEpochMs: number;
  endedAtEpochMs: number | null;
  recordingFile: string | null;
  recordingExists: boolean;
  recordingContainer: string | null;
  recordingCodec: string | null;
  recordingDurationMs: number | null;
  recordingAudioBytes: number | null;
  metadataFile: string | null;
  eventCount: number;
  transcriptStatus?: string | null;
  transcriptFile?: string | null;
  transcriptText?: string | null;
  transcriptionModel?: string | null;
  translationStatus?: string | null;
  translationFile?: string | null;
  translationText?: string | null;
  translationModel?: string | null;
  cloudSessionId?: string | null;
};

type ProcessingState = 'idle' | 'uploading' | 'completed' | 'failed';

type ProcessingResult = {
  transcript: string;
  translation: string;
  transcriptionModel: string;
  translationModel: string;
  error?: string;
};

type NativeShareModule = {
  shareFlightSessionFile(
    ownerUserId: string,
    filePath: string,
    mimeType: string,
    title: string
  ): Promise<{ success: boolean }>;
};

type FlightRecorderPanelProps = {
  ownerUserId: string;
};

const NativeShare = requireNativeModule<NativeShareModule>('AviationCallsignMonitor');
const SOURCE_LANGUAGE = 'en';
const TARGET_LANGUAGE = 'tl';
const emptyStatus: FlightSessionStatus = {
  active: false,
  ownerUserId: null,
  sessionId: null,
  recordingFile: null,
  recordingDurationMs: null,
  recordingAudioBytes: null,
  eventCount: 0
};

function sessionKey(session: FlightSessionSummary): string {
  return session.sessionId ?? session.recordingFile ?? session.metadataFile ?? 'unknown';
}

function fileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function fmtBytes(value: number | null): string {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDuration(value: number | null): string {
  if (!value) return '0s';
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function fmtPlayback(value: number | undefined): string {
  if (!value || Number.isNaN(value)) return '0:00';
  const totalSeconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function fmtDate(value: number): string {
  return value ? new Date(value).toLocaleString() : 'Unknown date';
}

function durationForUpload(session: FlightSessionSummary): number {
  if (session.recordingDurationMs && session.recordingDurationMs > 0) {
    return session.recordingDurationMs;
  }
  if (session.startedAtEpochMs && session.endedAtEpochMs) {
    return Math.max(1000, session.endedAtEpochMs - session.startedAtEpochMs);
  }
  return 1000;
}

function savedResult(session: FlightSessionSummary): ProcessingResult | null {
  if (!session.transcriptText && !session.translationText) return null;
  return {
    transcript: session.transcriptText ?? '',
    translation: session.translationText ?? '',
    transcriptionModel: session.transcriptionModel ?? 'saved transcript',
    translationModel: session.translationModel ?? 'saved translation'
  };
}

function recordingMimeType(session: FlightSessionSummary): string {
  const path = session.recordingFile?.toLowerCase() ?? '';
  if (
    session.recordingContainer === 'm4a' ||
    session.recordingCodec === 'aac_lc' ||
    path.endsWith('.m4a') ||
    path.endsWith('.mp4')
  ) {
    return 'audio/mp4';
  }
  return 'audio/wav';
}

export function FlightRecorderPanel({ ownerUserId }: FlightRecorderPanelProps) {
  const [status, setStatus] = useState<FlightSessionStatus>(emptyStatus);
  const [sessions, setSessions] = useState<FlightSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [processingStates, setProcessingStates] = useState<Record<string, ProcessingState>>({});
  const [processingResults, setProcessingResults] = useState<Record<string, ProcessingResult>>({});
  const player = useAudioPlayer(null);
  const playbackStatus = useAudioPlayerStatus(player);

  async function refreshSessions() {
    const next = (await AviationCallsignMonitor.listFlightSessions(ownerUserId)) as FlightSessionSummary[];
    setSessions(next);
    setProcessingStates((current) => {
      const updated = { ...current };
      for (const session of next) {
        const key = sessionKey(session);
        if (!updated[key] && (session.transcriptText || session.translationText)) {
          updated[key] = 'completed';
        }
      }
      return updated;
    });
    setProcessingResults((current) => {
      const updated = { ...current };
      for (const session of next) {
        const result = savedResult(session);
        if (result && !updated[sessionKey(session)]?.error) {
          updated[sessionKey(session)] = result;
        }
      }
      return updated;
    });
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
      Alert.alert('Unable to refresh recorder', error instanceof Error ? error.message : String(error));
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
        Alert.alert('Models still loading', 'Wait for Ready before starting flight recording.');
        return;
      }
      if (monitorStatus.monitoring) {
        Alert.alert('Stop normal monitor first', 'The flight recorder uses the shared microphone path.');
        return;
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone required', 'Enable microphone access first.');
        return;
      }
      setStatus((await AviationCallsignMonitor.startFlightSession(ownerUserId)) as FlightSessionStatus);
    } catch (error) {
      Alert.alert('Unable to start flight recording', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function stopSession() {
    try {
      setBusy(true);
      setStatus((await AviationCallsignMonitor.stopFlightSession()) as FlightSessionStatus);
      await refreshSessions();
    } catch (error) {
      Alert.alert('Unable to stop flight recording', error instanceof Error ? error.message : String(error));
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
      await setAudioModeAsync({ playsInSilentMode: true });
      player.pause();
      player.replace(fileUri(session.recordingFile));
      player.seekTo(0);
      player.play();
      setPlayingSessionId(session.sessionId ?? session.recordingFile);
    } catch (error) {
      setPlayingSessionId(null);
      Alert.alert('Unable to play recording', error instanceof Error ? error.message : String(error));
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

    const key = sessionKey(session);
    const id = session.sessionId ?? key;
    setProcessingStates((current) => ({ ...current, [key]: 'uploading' }));
    setProcessingResults((current) => {
      const updated = { ...current };
      delete updated[key];
      return updated;
    });

    try {
      const response = await processAudio({
        uri: fileUri(session.recordingFile),
        localSessionId: key,
        createdAt: new Date(session.startedAtEpochMs || Date.now()).toISOString(),
        durationMs: durationForUpload(session),
        sourceLanguage: SOURCE_LANGUAGE,
        targetLanguage: TARGET_LANGUAGE,
        inputName: 'Flight Recorder',
        inputType: 'shared-audio-frame',
        idempotencyKey: `flight-transcribe-${key}`
      });

      const saved = (await AviationCallsignMonitor.saveFlightSessionProcessingResult(
        ownerUserId,
        id,
        response.transcript,
        response.translation,
        SOURCE_LANGUAGE,
        TARGET_LANGUAGE,
        response.cloudSessionId,
        response.models.transcription,
        response.models.translation
      )) as FlightSessionSummary;

      setProcessingStates((current) => ({ ...current, [key]: 'completed' }));
      setProcessingResults((current) => ({
        ...current,
        [key]: {
          transcript: response.transcript,
          translation: response.translation,
          transcriptionModel: response.models.transcription,
          translationModel: response.models.translation
        }
      }));
      setSessions((current) => current.map((item) => sessionKey(item) === key ? saved : item));
      await refreshSessions();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProcessingStates((current) => ({ ...current, [key]: 'failed' }));
      setProcessingResults((current) => ({
        ...current,
        [key]: {
          transcript: '',
          translation: '',
          transcriptionModel: '',
          translationModel: '',
          error: message
        }
      }));
      Alert.alert('Transcription failed', message);
    }
  }

  async function exportFile(filePath: string | null | undefined, mimeType: string, title: string) {
    if (!filePath) {
      Alert.alert('Nothing to export', 'This file is not available yet.');
      return;
    }

    try {
      await NativeShare.shareFlightSessionFile(ownerUserId, filePath, mimeType, title);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
    }
  }

  function showTranslation(session: FlightSessionSummary) {
    const result = processingResults[sessionKey(session)] ?? savedResult(session);
    if (!result?.translation) {
      Alert.alert('Transcript required first', 'Press Transcribe first.');
      return;
    }
    Alert.alert('Translation', result.translation);
  }

  useEffect(() => {
    void refreshAll();
  }, [ownerUserId]);

  useEffect(() => {
    if (playbackStatus.didJustFinish) setPlayingSessionId(null);
  }, [playbackStatus.didJustFinish]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LOCAL FLIGHT AUDIO</Text>
          <Text style={styles.title}>Flight Recorder</Text>
          <Text style={styles.help}>
            Records compressed M4A audio locally during flight. Transcription,
            translation, and exports happen after the flight.
          </Text>
        </View>
        <View style={[styles.statusPill, status.active && styles.statusPillActive]}>
          <Text style={[styles.statusPillText, status.active && styles.statusPillTextActive]}>{status.active ? 'REC' : 'READY'}</Text>
        </View>
      </View>

      <View style={styles.recorderBox}>
        <View style={styles.row}>
          <View style={[styles.statusDot, status.active && styles.statusDotActive]} />
          <Text style={styles.statusText}>{status.active ? 'Recording and detecting callsigns' : 'Recorder stopped'}</Text>
        </View>
        <Text style={styles.detail}>Current session: {status.sessionId ?? 'none'}</Text>
        <Text style={styles.detail}>Events: {status.eventCount} · Duration: {fmtDuration(status.recordingDurationMs)} · Size: {fmtBytes(status.recordingAudioBytes)}</Text>
        <View style={styles.mainActions}>
          <Pressable disabled={busy || status.active} onPress={() => void startSession()} style={({ pressed }) => [styles.primaryButton, (pressed || busy || status.active) && styles.buttonPressed]}>
            <Text style={styles.primaryButtonText}>Start Flight Recording</Text>
          </Pressable>
          <Pressable disabled={busy || !status.active} onPress={() => void stopSession()} style={({ pressed }) => [styles.stopButton, (pressed || busy || !status.active) && styles.buttonPressed]}>
            <Text style={styles.stopButtonText}>Stop</Text>
          </Pressable>
        </View>
      </View>

      {playingSessionId ? (
        <View style={styles.playbackBar}>
          <Text style={styles.playbackText}>Playing {fmtPlayback(playbackStatus.currentTime)} / {fmtPlayback(playbackStatus.duration)}</Text>
          <Pressable onPress={stopPlayback} style={styles.stopPlaybackButton}><Text style={styles.stopPlaybackText}>Stop Playback</Text></Pressable>
        </View>
      ) : null}

      <View style={styles.sessionsHeaderRow}>
        <Text style={styles.sectionTitle}>Saved recordings</Text>
        <Pressable disabled={busy} onPress={() => void refreshAll()} style={({ pressed }) => [styles.refreshButton, (pressed || busy) && styles.buttonPressed]}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {sessions.length === 0 ? (
        <Text style={styles.emptyText}>No saved sessions for this signed-in user yet.</Text>
      ) : (
        sessions.map((session) => {
          const key = sessionKey(session);
          const state = processingStates[key] ?? (session.transcriptText ? 'completed' : 'idle');
          const result = processingResults[key] ?? savedResult(session);
          const isProcessing = state === 'uploading';
          const isPlaying = playingSessionId === (session.sessionId ?? session.recordingFile);
          const transcriptLabel = state === 'uploading' ? 'Uploading and processing' : state === 'completed' ? 'Completed and saved locally' : state === 'failed' ? 'Failed - retry available' : 'Not processed';
          const translationLabel = result?.translation ? 'Completed and saved locally' : 'Waiting for transcript';
          const title = session.sessionId ?? 'Flight session';

          return (
            <View key={key} style={styles.sessionBox}>
              <View style={styles.sessionTitleRow}>
                <View style={styles.sessionTitleCopy}>
                  <Text style={styles.sessionTitle}>{session.sessionId ?? 'Unnamed session'}</Text>
                  <Text style={styles.sessionDate}>{fmtDate(session.startedAtEpochMs)}</Text>
                </View>
                <Text style={styles.eventBadge}>{session.eventCount} events</Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metric}>Duration: {fmtDuration(session.recordingDurationMs)}</Text>
                <Text style={styles.metric}>Size: {fmtBytes(session.recordingAudioBytes)}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metric}>Format: {session.recordingContainer ?? 'unknown'} / {session.recordingCodec ?? 'unknown'}</Text>
                <Text style={session.recordingExists ? styles.existsText : styles.missingText}>{session.recordingExists ? 'Audio found' : 'Audio missing'}</Text>
              </View>

              <View style={styles.processingBox}>
                <Text style={styles.processingTitle}>Post-flight processing</Text>
                <Text style={styles.processingText}>Transcript: {transcriptLabel}</Text>
                <Text style={styles.processingText}>Translation: {translationLabel}</Text>
                {result?.error ? <Text style={styles.errorText}>{result.error}</Text> : null}
              </View>

              <View style={styles.sessionActions}>
                <Pressable disabled={!session.recordingExists || !session.recordingFile || isProcessing} onPress={() => void playSession(session)} style={({ pressed }) => [styles.actionButton, styles.playButton, isPlaying && styles.playButtonActive, (!session.recordingExists || !session.recordingFile || isProcessing || pressed) && styles.buttonPressed]}>
                  <Text style={styles.actionButtonText}>{isPlaying ? 'Replay' : 'Play'}</Text>
                </Pressable>
                <Pressable disabled={!session.recordingExists || !session.recordingFile || isProcessing} onPress={() => void transcribeSession(session)} style={({ pressed }) => [styles.actionButton, styles.transcribeButton, (!session.recordingExists || !session.recordingFile || isProcessing || pressed) && styles.buttonPressed]}>
                  <Text style={styles.actionButtonText}>{isProcessing ? 'Processing…' : state === 'completed' ? 'Re-transcribe' : 'Transcribe'}</Text>
                </Pressable>
                <Pressable onPress={() => showTranslation(session)} style={({ pressed }) => [styles.actionButton, styles.translateButton, pressed && styles.buttonPressed]}>
                  <Text style={styles.actionButtonText}>Translate</Text>
                </Pressable>
              </View>

              <View style={styles.sessionActions}>
                <Pressable disabled={!session.recordingFile || !session.recordingExists} onPress={() => void exportFile(session.recordingFile, recordingMimeType(session), `Export audio - ${title}`)} style={({ pressed }) => [styles.actionButton, styles.exportButton, (!session.recordingFile || !session.recordingExists || pressed) && styles.buttonPressed]}>
                  <Text style={styles.actionButtonText}>Export Audio</Text>
                </Pressable>
                <Pressable disabled={!session.metadataFile} onPress={() => void exportFile(session.metadataFile, 'application/json', `Export metadata - ${title}`)} style={({ pressed }) => [styles.actionButton, styles.exportButton, (!session.metadataFile || pressed) && styles.buttonPressed]}>
                  <Text style={styles.actionButtonText}>Export Metadata</Text>
                </Pressable>
                <Pressable disabled={!session.transcriptFile} onPress={() => void exportFile(session.transcriptFile, 'application/json', `Export transcript - ${title}`)} style={({ pressed }) => [styles.actionButton, styles.exportButton, (!session.transcriptFile || pressed) && styles.buttonPressed]}>
                  <Text style={styles.actionButtonText}>Export Transcript</Text>
                </Pressable>
                <Pressable disabled={!session.translationFile} onPress={() => void exportFile(session.translationFile, 'application/json', `Export translation - ${title}`)} style={({ pressed }) => [styles.actionButton, styles.exportButton, (!session.translationFile || pressed) && styles.buttonPressed]}>
                  <Text style={styles.actionButtonText}>Export Translation</Text>
                </Pressable>
              </View>

              {result?.transcript ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultTitle}>Transcript</Text>
                  <Text selectable numberOfLines={6} style={styles.resultText}>{result.transcript}</Text>
                  <Text style={styles.modelText}>{result.transcriptionModel} → {result.translationModel}</Text>
                </View>
              ) : null}

              {result?.translation ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultTitle}>Translation</Text>
                  <Text selectable numberOfLines={6} style={styles.resultText}>{result.translation}</Text>
                </View>
              ) : null}

              {session.transcriptFile ? <Text numberOfLines={2} style={styles.pathText}>Transcript file: {session.transcriptFile}</Text> : null}
              {session.translationFile ? <Text numberOfLines={2} style={styles.pathText}>Translation file: {session.translationFile}</Text> : null}
              {session.recordingFile ? <Text numberOfLines={2} style={styles.pathText}>Audio: {session.recordingFile}</Text> : null}
              {session.metadataFile ? <Text numberOfLines={2} style={styles.pathText}>Metadata: {session.metadataFile}</Text> : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 18, borderWidth: 1, gap: 14, padding: 16 },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { color: '#93c5fd', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#f8fafc', fontSize: 23, fontWeight: '900' },
  help: { color: '#94a3b8', fontSize: 13, lineHeight: 19 },
  statusPill: { backgroundColor: '#1e293b', borderColor: '#475569', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillActive: { backgroundColor: '#3b0a0a', borderColor: '#ef4444' },
  statusPillText: { color: '#cbd5e1', fontSize: 11, fontWeight: '900' },
  statusPillTextActive: { color: '#fecaca' },
  recorderBox: { backgroundColor: '#111c2e', borderColor: '#1e293b', borderRadius: 14, borderWidth: 1, gap: 8, padding: 13 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  statusDot: { backgroundColor: '#64748b', borderRadius: 5, height: 10, width: 10 },
  statusDotActive: { backgroundColor: '#ef4444' },
  statusText: { color: '#e2e8f0', fontWeight: '800' },
  detail: { color: '#cbd5e1', fontSize: 12, lineHeight: 17 },
  mainActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 12 },
  primaryButtonText: { color: '#eff6ff', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  stopButton: { alignItems: 'center', backgroundColor: '#991b1b', borderRadius: 12, flex: 0.45, justifyContent: 'center', minHeight: 46, paddingHorizontal: 12 },
  stopButtonText: { color: '#fee2e2', fontSize: 13, fontWeight: '900' },
  buttonPressed: { opacity: 0.55 },
  playbackBar: { alignItems: 'center', backgroundColor: '#0f1f36', borderColor: '#1d4ed8', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', padding: 10 },
  playbackText: { color: '#bfdbfe', flex: 1, fontSize: 12, fontWeight: '700' },
  stopPlaybackButton: { backgroundColor: '#991b1b', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  stopPlaybackText: { color: '#fee2e2', fontSize: 12, fontWeight: '800' },
  sessionsHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '900' },
  refreshButton: { borderColor: '#3b82f6', borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  refreshText: { color: '#93c5fd', fontSize: 12, fontWeight: '800' },
  emptyText: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  sessionBox: { backgroundColor: '#0b1220', borderColor: '#1e293b', borderRadius: 12, borderWidth: 1, gap: 7, padding: 12 },
  sessionTitleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  sessionTitleCopy: { flex: 1, gap: 3 },
  sessionTitle: { color: '#e2e8f0', fontSize: 14, fontWeight: '800' },
  sessionDate: { color: '#94a3b8', fontSize: 12 },
  eventBadge: { backgroundColor: '#172554', borderColor: '#1d4ed8', borderRadius: 999, borderWidth: 1, color: '#bfdbfe', fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { color: '#cbd5e1', fontSize: 12 },
  existsText: { color: '#86efac', fontSize: 12, fontWeight: '700' },
  missingText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },
  processingBox: { backgroundColor: '#111827', borderColor: '#293548', borderRadius: 10, borderWidth: 1, gap: 4, marginTop: 4, padding: 10 },
  processingTitle: { color: '#dbeafe', fontSize: 12, fontWeight: '900' },
  processingText: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  errorText: { color: '#fca5a5', fontSize: 12, lineHeight: 17 },
  sessionActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionButton: { alignItems: 'center', borderRadius: 9, minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  playButton: { backgroundColor: '#2563eb' },
  playButtonActive: { backgroundColor: '#1d4ed8' },
  transcribeButton: { backgroundColor: '#0f766e' },
  translateButton: { backgroundColor: '#6d28d9' },
  exportButton: { backgroundColor: '#475569' },
  actionButtonText: { color: '#eff6ff', fontSize: 12, fontWeight: '800' },
  resultBox: { backgroundColor: '#101826', borderColor: '#334155', borderRadius: 10, borderWidth: 1, gap: 5, marginTop: 4, padding: 10 },
  resultTitle: { color: '#e2e8f0', fontSize: 12, fontWeight: '900' },
  resultText: { color: '#cbd5e1', fontSize: 12, lineHeight: 18 },
  modelText: { color: '#64748b', fontSize: 11, lineHeight: 15 },
  pathText: { color: '#64748b', fontSize: 11, lineHeight: 15 }
});
