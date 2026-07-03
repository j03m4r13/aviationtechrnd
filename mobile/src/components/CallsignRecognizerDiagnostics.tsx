import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  addErrorListener,
  addStatusListener,
  addTranscriptListener,
  getStatus
} from '../../modules/aviation-callsign-monitor/src/AviationCallsignMonitorModule';
import type {
  CallsignErrorEvent,
  CallsignMonitorStatus,
  CallsignTranscriptEvent
} from '../../modules/aviation-callsign-monitor';

const EMPTY_STATUS: CallsignMonitorStatus = {
  initialized: false,
  monitoring: false,
  callsign: '',
  whisperModel: null,
  voskModel: null
};

export function CallsignRecognizerDiagnostics() {
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [lastVosk, setLastVosk] = useState<CallsignTranscriptEvent | null>(null);
  const [lastWhisper, setLastWhisper] = useState<CallsignTranscriptEvent | null>(null);
  const [whisperRuns, setWhisperRuns] = useState(0);
  const [lastError, setLastError] = useState<CallsignErrorEvent | null>(null);

  useEffect(() => {
    const transcripts = addTranscriptListener((event) => {
      if (event.source === 'WHISPER') {
        setLastWhisper(event);
        setWhisperRuns((count) => count + 1);
      } else {
        setLastVosk(event);
      }
    });
    const statuses = addStatusListener(setStatus);
    const errors = addErrorListener(setLastError);
    getStatus().then(setStatus).catch(() => undefined);

    return () => {
      transcripts.remove();
      statuses.remove();
      errors.remove();
    };
  }, []);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Recognizer diagnostics</Text>
      <Text style={styles.help}>
        Speak for at least one second, then stay silent for one to two seconds so Whisper receives a completed segment.
      </Text>

      <Text style={styles.engine}>
        Vosk model: {status.voskModel ?? 'not loaded'}
      </Text>
      <Text style={styles.engine}>
        Whisper model: {status.whisperModel ?? 'not loaded'}
      </Text>
      <Text style={styles.engine}>Whisper results received: {whisperRuns}</Text>

      <View style={styles.output}>
        <Text style={styles.label}>LATEST VOSK</Text>
        <Text style={styles.value}>
          {lastVosk ? `${lastVosk.source}: ${lastVosk.transcript}` : 'No Vosk result yet.'}
        </Text>
      </View>

      <View style={styles.output}>
        <Text style={styles.label}>LATEST WHISPER</Text>
        <Text style={styles.value}>
          {lastWhisper
            ? `WHISPER: ${lastWhisper.transcript}`
            : status.whisperModel
              ? 'Whisper is loaded and waiting for a completed speech segment.'
              : 'Whisper model is not loaded.'}
        </Text>
      </View>

      {lastError ? (
        <Text style={styles.error}>{lastError.code}: {lastError.message}</Text>
      ) : null}
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
  title: { color: '#f0f4f9', fontSize: 17, fontWeight: '800' },
  help: { color: '#9dacbf', fontSize: 12, lineHeight: 18 },
  engine: { color: '#85b7ff', fontSize: 12 },
  output: {
    backgroundColor: '#0b0f16',
    borderRadius: 10,
    gap: 5,
    padding: 11
  },
  label: {
    color: '#6f7d91',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1
  },
  value: { color: '#e2e8f0', fontSize: 13, lineHeight: 19 },
  error: { color: '#fca5a5', fontSize: 12, lineHeight: 18 }
});
