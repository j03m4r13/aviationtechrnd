import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import {
  AudioModule,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingInput
} from 'expo-audio';
import { StatusBar } from 'expo-status-bar';

import { AudioInputList } from './src/components/AudioInputList';
import { LanguageChips } from './src/components/LanguageChips';
import { PrimaryButton } from './src/components/PrimaryButton';
import { SectionCard } from './src/components/SectionCard';
import { SPEECH_RECORDING_OPTIONS } from './src/config/audio';
import {
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES
} from './src/config/languages';
import { processAudio } from './src/services/audio-processing-api';
import type {
  ProcessingResult,
  ProcessingState
} from './src/types/audio';

const HEADSET_HINT =
  /(rog|bluetooth|headset|external|usb|wireless|sco|ble)/i;

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

export default function App() {
  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null);
  const playerState = useAudioPlayerStatus(player);

  const [inputs, setInputs] = useState<RecordingInput[]>([]);
  const [selectedInputUid, setSelectedInputUid] = useState<string | null>(null);
  const [currentInput, setCurrentInput] = useState<RecordingInput | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('tl');
  const [processingState, setProcessingState] =
    useState<ProcessingState>('idle');
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [message, setMessage] = useState('Initializing audio…');

  const preparePromiseRef = useRef<Promise<void> | null>(null);

  const ensureRecorderPrepared = useCallback(async () => {
    const status = recorder.getStatus();

    if (status.canRecord) {
      return;
    }

    if (!preparePromiseRef.current) {
      preparePromiseRef.current = recorder
        .prepareToRecordAsync()
        .finally(() => {
          preparePromiseRef.current = null;
        });
    }

    await preparePromiseRef.current;
  }, [recorder]);

  const isBusy =
    recorderState.isRecording || processingState === 'uploading';

  const meterPercent = useMemo(() => {
    const value = recorderState.metering;

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }

    // Expo metering is normally a negative dB value. Map -60..0 dB to 0..100%.
    return Math.max(0, Math.min(100, ((value + 60) / 60) * 100));
  }, [recorderState.metering]);

  const refreshInputs = useCallback(async () => {
    try {
      setMessage('Enumerating recording inputs…');
      await ensureRecorderPrepared();

      const availableInputs = await recorder.getAvailableInputs();
      const activeInput = await recorder.getCurrentInput();

      setInputs(availableInputs);
      setCurrentInput(activeInput);

      setSelectedInputUid((existing) => {
        if (existing && availableInputs.some((item) => item.uid === existing)) {
          return existing;
        }

        const likelyHeadset = availableInputs.find(
          (item) =>
            HEADSET_HINT.test(item.name) || HEADSET_HINT.test(item.type)
        );

        return likelyHeadset?.uid ?? activeInput?.uid ?? availableInputs[0]?.uid ?? null;
      });

      setMessage(
        availableInputs.length > 0
          ? `Found ${availableInputs.length} recording input${
              availableInputs.length === 1 ? '' : 's'
            }.`
          : 'No recording inputs were returned.'
      );
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'Unable to enumerate inputs.';
      setMessage(details);
    }
  }, [ensureRecorderPrepared, recorder]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        if (!cancelled) {
          setMessage('Microphone permission was denied.');
        }
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix'
      });

      if (!cancelled) {
        await refreshInputs();
      }
    }

    void initialize().catch((error: unknown) => {
      if (!cancelled) {
        setMessage(
          error instanceof Error ? error.message : 'Audio initialization failed.'
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshInputs]);

  async function selectInput(input: RecordingInput) {
    try {
      await ensureRecorderPrepared();
      await recorder.setInput(input.uid);
      const selected = await recorder.getCurrentInput();

      setSelectedInputUid(input.uid);
      setCurrentInput(selected);
      setMessage(`Selected input: ${selected.name}`);
    } catch (error) {
      Alert.alert(
        'Could not select microphone',
        error instanceof Error ? error.message : 'Unknown audio routing error.'
      );
    }
  }

  async function startRecording() {
    try {
      player.pause();
      setRecordingUri(null);
      setResult(null);
      setProcessingState('recording');
      setMessage('Preparing recorder…');

      await ensureRecorderPrepared();

      if (selectedInputUid) {
        await recorder.setInput(selectedInputUid);
      }

      const selected = await recorder.getCurrentInput();
      setCurrentInput(selected);

      recorder.record();
      setMessage(`Recording from ${selected.name}`);
    } catch (error) {
      setProcessingState('error');
      setMessage(
        error instanceof Error ? error.message : 'Unable to start recording.'
      );
    }
  }

  async function stopRecording() {
    try {
      setMessage('Finalizing recording…');
      await recorder.stop();

      const uri = recorder.uri;
      if (!uri) {
        throw new Error('The recorder stopped without returning a file URI.');
      }

      setRecordingUri(uri);
      player.replace(uri);
      setProcessingState('recorded');
      setMessage('Recording saved. Play it back before using AI.');
    } catch (error) {
      setProcessingState('error');
      setMessage(
        error instanceof Error ? error.message : 'Unable to stop recording.'
      );
    }
  }

  async function playRecording() {
    if (!recordingUri) {
      return;
    }

    try {
      if (playerState.playing) {
        player.pause();
        return;
      }

      await player.seekTo(0);
      player.play();
    } catch (error) {
      Alert.alert(
        'Playback failed',
        error instanceof Error ? error.message : 'Unable to play recording.'
      );
    }
  }

  async function transcribeAndTranslate() {
    if (!recordingUri) {
      return;
    }

    try {
      setProcessingState('uploading');
      setMessage('Uploading, transcribing, and translating…');

      const response = await processAudio({
        uri: recordingUri,
        sourceLanguage,
        targetLanguage
      });

      setResult(response);
      setProcessingState('completed');
      setMessage('Processing completed.');
    } catch (error) {
      setProcessingState('error');
      setMessage(
        error instanceof Error ? error.message : 'Processing failed.'
      );
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>ANDROID MVP · RECORDED AUDIO</Text>
          <Text style={styles.title}>Aviation Voice</Text>
          <Text style={styles.subtitle}>
            Verify the wireless microphone first, then transcribe and translate.
          </Text>
        </View>

        <SectionCard
          title="1. Recording input"
          right={
            <Pressable disabled={isBusy} onPress={() => void refreshInputs()}>
              <Text style={[styles.link, isBusy && styles.dimmed]}>
                Refresh inputs
              </Text>
            </Pressable>
          }
        >
          <AudioInputList
            currentUid={currentInput?.uid ?? null}
            disabled={isBusy}
            inputs={inputs}
            onSelect={(input) => void selectInput(input)}
            selectedUid={selectedInputUid}
          />

          <View style={styles.currentRoute}>
            <Text style={styles.mutedLabel}>CURRENT INPUT</Text>
            <Text style={styles.routeName}>
              {currentInput
                ? `${currentInput.name} · ${currentInput.type}`
                : 'Not available'}
            </Text>
          </View>
        </SectionCard>

        <SectionCard title="2. Record and verify">
          <View style={styles.timerRow}>
            <Text style={styles.timer}>
              {formatDuration(recorderState.durationMillis)}
            </Text>
            <Text style={styles.recordingState}>
              {recorderState.isRecording ? 'RECORDING' : 'READY'}
            </Text>
          </View>

          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                { width: `${Math.max(2, meterPercent)}%` }
              ]}
            />
          </View>

          <PrimaryButton
            danger={recorderState.isRecording}
            disabled={processingState === 'uploading'}
            label={recorderState.isRecording ? 'Stop recording' : 'Start recording'}
            onPress={() =>
              void (recorderState.isRecording
                ? stopRecording()
                : startRecording())
            }
          />

          <PrimaryButton
            disabled={!recordingUri || recorderState.isRecording}
            label={playerState.playing ? 'Pause playback' : 'Play latest recording'}
            onPress={() => void playRecording()}
          />

          <Text style={styles.help}>
            For a reliable route test, tap the ROG boom microphone during the
            recording while keeping the phone away from you.
          </Text>
        </SectionCard>

        <SectionCard title="3. Transcribe and translate">
          <LanguageChips
            disabled={isBusy}
            label="Spoken language"
            onChange={setSourceLanguage}
            options={SOURCE_LANGUAGES}
            value={sourceLanguage}
          />

          <LanguageChips
            disabled={isBusy}
            label="Translate into"
            onChange={setTargetLanguage}
            options={TARGET_LANGUAGES}
            value={targetLanguage}
          />

          <PrimaryButton
            disabled={!recordingUri || recorderState.isRecording}
            label="Transcribe and translate"
            loading={processingState === 'uploading'}
            onPress={() => void transcribeAndTranslate()}
          />
        </SectionCard>

        <SectionCard title="Status">
          <Text style={styles.statusText}>{message}</Text>
          <Text style={styles.uri} numberOfLines={2}>
            {recordingUri ?? 'No recording file yet.'}
          </Text>
        </SectionCard>

        {result ? (
          <>
            <SectionCard title="Original transcript">
              <Text selectable style={styles.resultText}>
                {result.transcript}
              </Text>
            </SectionCard>

            <SectionCard title="Translation">
              <Text selectable style={styles.resultText}>
                {result.translation}
              </Text>
              <Text style={styles.models}>
                {result.models.transcription} → {result.models.translation}
              </Text>
            </SectionCard>
          </>
        ) : null}

        <Text style={styles.footer}>
          MVP output is not an authoritative source for operational aviation
          communication.
        </Text>
      </ScrollView>
    </View>
  );
}

const topInset =
  Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 22;

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0b0f16',
    flex: 1
  },
  content: {
    gap: 14,
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: topInset
  },
  hero: {
    gap: 6,
    paddingBottom: 8,
    paddingTop: 8
  },
  eyebrow: {
    color: '#85b7ff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4
  },
  title: {
    color: '#f5f8fc',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8
  },
  subtitle: {
    color: '#9dacbf',
    fontSize: 15,
    lineHeight: 21
  },
  link: {
    color: '#85b7ff',
    fontSize: 13,
    fontWeight: '700'
  },
  dimmed: {
    opacity: 0.4
  },
  currentRoute: {
    backgroundColor: '#0f141d',
    borderRadius: 10,
    gap: 4,
    padding: 11
  },
  mutedLabel: {
    color: '#6f7d91',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1
  },
  routeName: {
    color: '#dbe4ef',
    fontSize: 13,
    fontWeight: '600'
  },
  timerRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  timer: {
    color: '#f5f8fc',
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '800'
  },
  recordingState: {
    color: '#ff9898',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  meterTrack: {
    backgroundColor: '#2b3445',
    borderRadius: 999,
    height: 9,
    overflow: 'hidden'
  },
  meterFill: {
    backgroundColor: '#77e8a9',
    borderRadius: 999,
    height: '100%'
  },
  help: {
    color: '#8e9caf',
    fontSize: 12,
    lineHeight: 18
  },
  statusText: {
    color: '#dbe4ef',
    fontSize: 14,
    lineHeight: 20
  },
  uri: {
    color: '#6f7d91',
    fontFamily: Platform.select({
      android: 'monospace',
      default: undefined
    }),
    fontSize: 11
  },
  resultText: {
    color: '#eef3f8',
    fontSize: 16,
    lineHeight: 24
  },
  models: {
    color: '#6f7d91',
    fontSize: 11
  },
  footer: {
    color: '#69768a',
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 8,
    textAlign: 'center'
  }
});
