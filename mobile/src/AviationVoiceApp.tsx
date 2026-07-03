import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
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
import { File } from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';

import BluetoothAudioRoute from '../modules/bluetooth-audio-route';

import { AudioInputList } from './components/AudioInputList';
import { AccountScreen } from './components/AccountScreen';
import { LanguageChips } from './components/LanguageChips';
import { PrimaryButton } from './components/PrimaryButton';
import { SectionCard } from './components/SectionCard';
import { SessionHistoryCard } from './components/SessionHistoryCard';
import { SPEECH_RECORDING_OPTIONS } from './config/audio';
import {
  languageLabel,
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES
} from './config/languages';
import {
  completeRecordingSession,
  createRecordingSession,
  deleteRecordingSession,
  failRecordingSession,
  initializeSessionDatabase,
  claimLegacySessions,
  listRecordingSessions,
  mergeCloudSessions,
  markSessionProcessing
} from './database/session-repository';
import { processAudio } from './services/audio-processing-api';
import { deleteCloudSession, listCloudSessions } from './services/cloud-api';
import type {
  ProcessingResult,
  ProcessingState
} from './types/audio';
import type { RecordingSession } from './types/session';

const HEADSET_HINT =
  /(rog|bluetooth|headset|external|usb|wireless|sco|ble)/i;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isBluetoothInput(input: RecordingInput | null | undefined): boolean {
  if (!input) {
    return false;
  }

  return HEADSET_HINT.test(`${input.name} ${input.type}`);
}

async function requestBluetoothConnectPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
  const alreadyGranted = await PermissionsAndroid.check(permission);

  if (alreadyGranted) {
    return true;
  }

  const result = await PermissionsAndroid.request(permission, {
    title: 'Bluetooth headset access',
    message:
      'Aviation Voice needs Bluetooth access to use your headset microphone.',
    buttonPositive: 'Allow',
    buttonNegative: 'Cancel'
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

type AppScreen = 'record' | 'history' | 'account';

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

type Props = {
  user: User;
  signOut: () => Promise<void>;
};

export function AviationVoiceApp({ user, signOut }: Props) {
  const userId = user.id;

  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null);
  const playerState = useAudioPlayerStatus(player);

  const [screen, setScreen] = useState<AppScreen>('record');
  const [inputs, setInputs] = useState<RecordingInput[]>([]);
  const [selectedInputUid, setSelectedInputUid] = useState<string | null>(null);
  const [currentInput, setCurrentInput] = useState<RecordingInput | null>(null);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('tl');
  const [processingState, setProcessingState] =
    useState<ProcessingState>('idle');
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [message, setMessage] = useState('Initializing storage and audio…');
  const preparePromiseRef = useRef<Promise<void> | null>(null);
  const recordingTransitionRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const [recordingTransition, setRecordingTransition] = useState<
    'idle' | 'starting' | 'stopping'
  >('idle');
  const [recordingActive, setRecordingActive] = useState(false);

  const ensureRecorderPrepared = useCallback(async () => {
    const status = recorder.getStatus();

    if (status.canRecord) {
      return;
    }

    if (!preparePromiseRef.current) {
      preparePromiseRef.current = recorder.prepareToRecordAsync().finally(() => {
        preparePromiseRef.current = null;
      });
    }

    await preparePromiseRef.current;
  }, [recorder]);

  const refreshSessions = useCallback(async () => {
    const storedSessions = await listRecordingSessions(userId);
    setSessions(storedSessions);
  }, [userId]);

  const isRecording = recorderState.isRecording || recordingActive;

  const isBusy =
    isRecording ||
    recordingTransition !== 'idle' ||
    processingState === 'uploading';

  const meterPercent = useMemo(() => {
    const value = recorderState.metering;

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }

    return Math.max(0, Math.min(100, ((value + 60) / 60) * 100));
  }, [recorderState.metering]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );

  const localCompletedSessions = useMemo(
    () => sessions.filter((session) => session.status === 'completed').length,
    [sessions]
  );

  const localCompletedSeconds = useMemo(
    () =>
      Math.round(
        sessions
          .filter((session) => session.status === 'completed')
          .reduce((total, session) => total + session.durationMs, 0) / 1000
      ),
    [sessions]
  );

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

        return (
          likelyHeadset?.uid ??
          activeInput?.uid ??
          availableInputs[0]?.uid ??
          null
        );
      });

      setMessage(
        availableInputs.length > 0
          ? `Found ${availableInputs.length} recording input${
              availableInputs.length === 1 ? '' : 's'
            }.`
          : 'No recording inputs were returned.'
      );
    } catch (error) {
      console.error('refreshInputs failed', error);
      setMessage(
        error instanceof Error ? error.message : 'Unable to enumerate inputs.'
      );
    }
  }, [ensureRecorderPrepared, recorder]);

  useEffect(() => {
    let cancelled = false;

    async function initializeStorage() {
      await initializeSessionDatabase();
      await claimLegacySessions(userId);
      const storedSessions = await listRecordingSessions(userId);

      if (!cancelled) {
        setSessions(storedSessions);
        setDatabaseReady(true);
      }
    }

    void initializeStorage().catch((error: unknown) => {
      console.error('Database initialization failed', error);
      if (!cancelled) {
        setMessage(
          error instanceof Error
            ? `Storage initialization failed: ${error.message}`
            : 'Storage initialization failed.'
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    async function initializeAudio() {
      const permission = await AudioModule.requestRecordingPermissionsAsync();

      if (!permission.granted) {
        if (!cancelled) {
          setMessage('Microphone permission was denied.');
        }
        return;
      }

      const bluetoothPermissionGranted =
        await requestBluetoothConnectPermission();

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix'
      });

      if (!bluetoothPermissionGranted && !cancelled) {
        setMessage(
          'Bluetooth access was denied. The built-in microphone can still be used.'
        );
      }

      if (!cancelled) {
        await refreshInputs();
      }
    }

    void initializeAudio().catch((error: unknown) => {
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
      if (isBluetoothInput(input)) {
        const bluetoothPermissionGranted =
          await requestBluetoothConnectPermission();

        if (!bluetoothPermissionGranted) {
          throw new Error(
            'Bluetooth permission is required to use the headset microphone.'
          );
        }
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix'
      });

      await ensureRecorderPrepared();
      await recorder.setInput(input.uid);

      // setInput stores the preferred microphone. The actual Bluetooth
      // communication route is activated only while recording.
      if (Platform.OS === 'android' && isBluetoothInput(input)) {
        await sleep(200);
        await BluetoothAudioRoute.stopBluetoothRoute();
      }

      const selected = await recorder.getCurrentInput();

      setSelectedInputUid(input.uid);
      setCurrentInput(selected);
      setMessage(`Selected input: ${selected.name}`);

      console.log('Selected recording input', selected);
    } catch (error) {
      console.error('selectInput failed', error);
      Alert.alert(
        'Could not select microphone',
        error instanceof Error ? error.message : 'Unknown audio routing error.'
      );
    }
  }

  async function startRecording() {
    if (!databaseReady) {
      setMessage('Local storage is not ready yet.');
      return;
    }

    // Prevent several native record() calls when the button is tapped quickly.
    if (recordingTransitionRef.current || isRecording) {
      return;
    }

    recordingTransitionRef.current = true;
    setRecordingTransition('starting');

    try {
      player.pause();
      setPlayingSessionId(null);
      setRecordingUri(null);
      setActiveSessionId(null);
      setResult(null);
      setMessage('Preparing recorder…');

      const requestedInput =
        inputs.find((input) => input.uid === selectedInputUid) ?? null;
      const wantsBluetooth = isBluetoothInput(requestedInput);

      if (wantsBluetooth) {
        const bluetoothPermissionGranted =
          await requestBluetoothConnectPermission();

        if (!bluetoothPermissionGranted) {
          throw new Error(
            'Bluetooth permission is required to use the headset microphone.'
          );
        }
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix'
      });

      await ensureRecorderPrepared();

      if (selectedInputUid) {
        await recorder.setInput(selectedInputUid);
      }

      if (Platform.OS === 'android') {
        if (wantsBluetooth) {
          setMessage('Connecting the Bluetooth call-audio route…');
          const route = await BluetoothAudioRoute.startBluetoothRoute();

          console.log('Bluetooth route result', route);

          if (!route.success) {
            throw new Error(
              route.message ||
                'Android could not activate the Bluetooth headset microphone.'
            );
          }

          // Give the headset HFP/SCO route time to settle before MediaRecorder starts.
          await sleep(700);
        } else {
          await BluetoothAudioRoute.stopBluetoothRoute();
        }
      }

      // Expo's documented start sequence is prepareToRecordAsync() followed by
      // record(). record() returns void; recorder state updates arrive separately.
      recorder.record();

      recordingStartedAtRef.current = Date.now();
      setRecordingActive(true);
      setProcessingState('recording');

      let selected = requestedInput;
      try {
        selected = await recorder.getCurrentInput();
      } catch (inputError) {
        console.warn('Unable to read routed input after starting', inputError);
      }

      if (selected) {
        setCurrentInput(selected);
      }

      console.log('Recorder start requested', {
        selectedInput: selected,
        bluetooth: wantsBluetooth
      });

      setMessage(
        selected
          ? `Recording from ${selected.name}`
          : 'Recording started.'
      );
    } catch (error) {
      console.error('startRecording failed', error);

      try {
        if (recorder.isRecording) {
          await recorder.stop();
        }
      } catch (cleanupError) {
        console.warn('Recorder cleanup after start failure failed', cleanupError);
      }

      if (Platform.OS === 'android') {
        try {
          await BluetoothAudioRoute.stopBluetoothRoute();
        } catch (routeCleanupError) {
          console.warn('Bluetooth route cleanup failed', routeCleanupError);
        }
      }

      recordingStartedAtRef.current = null;
      setRecordingActive(false);
      setProcessingState('error');
      setMessage(
        error instanceof Error ? error.message : 'Unable to start recording.'
      );
    } finally {
      recordingTransitionRef.current = false;
      setRecordingTransition('idle');
    }
  }

  async function stopRecording() {
    if (recordingTransitionRef.current) {
      return;
    }

    recordingTransitionRef.current = true;
    setRecordingTransition('stopping');

    const elapsedFallback = recordingStartedAtRef.current
      ? Date.now() - recordingStartedAtRef.current
      : 0;
    const durationMs = Math.max(
      1,
      recorderState.durationMillis,
      elapsedFallback
    );

    try {
      setMessage('Finalizing and saving recording…');
      await recorder.stop();
      setRecordingActive(false);
      recordingStartedAtRef.current = null;

      if (Platform.OS === 'android') {
        await BluetoothAudioRoute.stopBluetoothRoute();
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix'
      });

      const uri = recorder.uri;
      if (!uri) {
        throw new Error('The recorder stopped without returning a file URI.');
      }

      const recordedFile = new File(uri);
      console.log('Recorded audio file', {
        uri,
        exists: recordedFile.exists,
        size: recordedFile.size,
        durationMs
      });

      if (!recordedFile.exists || recordedFile.size === 0) {
        throw new Error('Android created an empty audio recording.');
      }

      const session = await createRecordingSession({
        userId,
        audioUri: uri,
        durationMs,
        sourceLanguage,
        targetLanguage,
        inputName: currentInput?.name ?? null,
        inputType: currentInput?.type ?? null
      });

      setRecordingUri(uri);
      setActiveSessionId(session.id);
      player.replace(uri);
      setProcessingState('recorded');
      setMessage('Recording saved locally. Play it back before using AI.');
      await refreshSessions();
    } catch (error) {
      console.error('stopRecording failed', error);
      setRecordingActive(false);
      recordingStartedAtRef.current = null;
      setProcessingState('error');
      setMessage(
        error instanceof Error ? error.message : 'Unable to save recording.'
      );
    } finally {
      if (Platform.OS === 'android') {
        try {
          await BluetoothAudioRoute.stopBluetoothRoute();
        } catch (routeCleanupError) {
          console.warn('Bluetooth route cleanup failed', routeCleanupError);
        }
      }

      recordingTransitionRef.current = false;
      setRecordingTransition('idle');
    }
  }

  async function playAudio(uri: string, sessionId: string) {
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        interruptionMode: 'doNotMix'
      });

      const file = new File(uri);
      if (!file.exists || file.size === 0) {
        throw new Error('The audio file is missing or empty.');
      }

      if (playerState.playing && playingSessionId === sessionId) {
        player.pause();
        return;
      }

      player.pause();
      player.replace(uri);
      await player.seekTo(0);
      setPlayingSessionId(sessionId);
      player.play();
    } catch (error) {
      Alert.alert(
        'Playback failed',
        error instanceof Error ? error.message : 'Unable to play recording.'
      );
    }
  }

  async function transcribeAndTranslate() {
    if (!recordingUri || !activeSessionId) {
      return;
    }

    const sessionId = activeSessionId;

    try {
      setProcessingState('uploading');
      setMessage('Uploading, transcribing, and translating…');
      const idempotencyKey = await markSessionProcessing(
        sessionId,
        sourceLanguage,
        targetLanguage
      );
      await refreshSessions();

      const currentSession =
        sessions.find((session) => session.id === sessionId) ?? activeSession;
      if (!currentSession) {
        throw new Error('The local session could not be found.');
      }

      const response = await processAudio({
        uri: recordingUri,
        localSessionId: sessionId,
        createdAt: currentSession.createdAt,
        durationMs: currentSession.durationMs,
        sourceLanguage,
        targetLanguage,
        inputName: currentSession.inputName,
        inputType: currentSession.inputType,
        idempotencyKey
      });

      await completeRecordingSession(sessionId, response, response.cloudSessionId);
      setResult(response);
      setProcessingState('completed');
      setMessage('Processing completed and saved to history.');
      await refreshSessions();
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'Processing failed.';

      try {
        await failRecordingSession(sessionId, details);
        await refreshSessions();
      } catch (storageError) {
        console.error('Failed to save processing error', storageError);
      }

      setProcessingState('error');
      setMessage(details);
    }
  }

  function confirmDeleteSession(session: RecordingSession) {
    Alert.alert(
      'Delete recording?',
      'This permanently deletes the local audio file and its saved transcripts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void removeSession(session)
        }
      ]
    );
  }

  async function removeSession(session: RecordingSession) {
    try {
      if (playingSessionId === session.id) {
        player.pause();
        setPlayingSessionId(null);
      }

      if (session.cloudSessionId) {
        await deleteCloudSession(session.cloudSessionId);
      }

      if (session.audioUri) {
        const file = new File(session.audioUri);
        if (file.exists) {
          file.delete();
        }
      }

      await deleteRecordingSession(session.id);

      if (activeSessionId === session.id) {
        setActiveSessionId(null);
        setRecordingUri(null);
        setResult(null);
        setProcessingState('idle');
      }

      if (openSessionId === session.id) {
        setOpenSessionId(null);
      }

      await refreshSessions();
      setMessage('Recording and transcript deleted.');
    } catch (error) {
      Alert.alert(
        'Delete failed',
        error instanceof Error ? error.message : 'Unable to delete session.'
      );
    }
  }

  function switchScreen(nextScreen: AppScreen) {
    setScreen(nextScreen);
    if (nextScreen === 'history' && databaseReady) {
      void refreshSessions();
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
          <Text style={styles.eyebrow}>ANDROID MVP · AUTHENTICATED CLOUD SYNC</Text>
          <Text style={styles.title}>Aviation Voice</Text>
          <Text style={styles.subtitle}>
            Record locally, process securely, and synchronize transcripts to your account.
          </Text>
        </View>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => switchScreen('record')}
            style={[styles.tab, screen === 'record' && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                screen === 'record' && styles.tabTextActive
              ]}
            >
              Recorder
            </Text>
          </Pressable>
          <Pressable
            disabled={isRecording}
            onPress={() => switchScreen('history')}
            style={[
              styles.tab,
              screen === 'history' && styles.tabActive,
              isRecording && styles.dimmed
            ]}
          >
            <Text
              style={[
                styles.tabText,
                screen === 'history' && styles.tabTextActive
              ]}
            >
              History ({sessions.length})
            </Text>
          </Pressable>
          <Pressable
            disabled={isRecording}
            onPress={() => switchScreen('account')}
            style={[
              styles.tab,
              screen === 'account' && styles.tabActive,
              isRecording && styles.dimmed
            ]}
          >
            <Text
              style={[
                styles.tabText,
                screen === 'account' && styles.tabTextActive
              ]}
            >
              Account
            </Text>
          </Pressable>
        </View>

        {screen === 'record' ? (
          <>
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
                  {isRecording ? 'RECORDING' : 'READY'}
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
                danger={isRecording}
                disabled={
                  processingState === 'uploading' ||
                  !databaseReady ||
                  recordingTransition !== 'idle'
                }
                label={
                  recordingTransition === 'starting'
                    ? 'Starting recorder…'
                    : recordingTransition === 'stopping'
                      ? 'Stopping recorder…'
                      : isRecording
                        ? 'Stop recording'
                        : 'Start recording'
                }
                onPress={() =>
                  void (isRecording
                    ? stopRecording()
                    : startRecording())
                }
              />

              <PrimaryButton
                disabled={!recordingUri || isRecording}
                label={
                  playerState.playing && playingSessionId === activeSessionId
                    ? 'Pause playback'
                    : 'Play latest recording'
                }
                onPress={() => {
                  if (recordingUri && activeSessionId) {
                    void playAudio(recordingUri, activeSessionId);
                  }
                }}
              />

              <Text style={styles.help}>
                Each stopped recording is now saved immediately, even before AI
                processing begins.
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
                disabled={!recordingUri || !activeSessionId || isRecording}
                label="Transcribe and translate"
                loading={processingState === 'uploading'}
                onPress={() => void transcribeAndTranslate()}
              />
            </SectionCard>

            <SectionCard title="Status">
              <Text style={styles.statusText}>{message}</Text>
              <Text style={styles.uri} numberOfLines={2}>
                {recordingUri ?? 'No current recording file.'}
              </Text>
              {activeSession ? (
                <Text style={styles.sessionId}>Session: {activeSession.id}</Text>
              ) : null}
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
          </>
        ) : screen === 'history' ? (
          <SectionCard
            title="Saved sessions"
            right={
              <Pressable onPress={() => void refreshSessions()}>
                <Text style={styles.link}>Refresh</Text>
              </Pressable>
            }
          >
            {!databaseReady ? (
              <Text style={styles.emptyText}>Opening local database…</Text>
            ) : sessions.length === 0 ? (
              <Text style={styles.emptyText}>
                No recordings yet. Record and stop a clip to create the first
                saved session.
              </Text>
            ) : (
              sessions.map((session) => {
                const isOpen = openSessionId === session.id;
                const isPlaying =
                  playingSessionId === session.id && playerState.playing;

                return (
                  <View key={session.id} style={styles.historyItem}>
                    <SessionHistoryCard
                      disabled={isBusy}
                      isOpen={isOpen}
                      isPlaying={isPlaying}
                      onDelete={() => confirmDeleteSession(session)}
                      onOpen={() =>
                        setOpenSessionId(isOpen ? null : session.id)
                      }
                      onPlay={() => {
                        if (session.audioUri) {
                          void playAudio(session.audioUri, session.id);
                        }
                      }}
                      session={session}
                    />

                    {isOpen ? (
                      <View style={styles.details}>
                        <Text style={styles.detailHeading}>Session details</Text>
                        <Text style={styles.detailMeta}>
                          {formatDate(session.createdAt)} ·{' '}
                          {formatDuration(session.durationMs)}
                        </Text>
                        <Text style={styles.detailMeta}>
                          {languageLabel(session.sourceLanguage)} →{' '}
                          {languageLabel(session.targetLanguage)}
                        </Text>
                        <Text style={styles.detailMeta}>
                          Cloud: {session.syncStatus.replace('_', ' ').toUpperCase()}
                        </Text>
                        <Text style={styles.detailMeta}>
                          Input: {session.inputName ?? 'Unknown'}
                          {session.inputType ? ` · ${session.inputType}` : ''}
                        </Text>

                        {session.errorMessage ? (
                          <View style={styles.errorBox}>
                            <Text style={styles.errorTitle}>Processing error</Text>
                            <Text selectable style={styles.errorText}>
                              {session.errorMessage}
                            </Text>
                          </View>
                        ) : null}

                        <Text style={styles.detailLabel}>ORIGINAL TRANSCRIPT</Text>
                        <Text selectable style={styles.detailText}>
                          {session.originalTranscript ?? 'Not available yet.'}
                        </Text>

                        <Text style={styles.detailLabel}>TRANSLATION</Text>
                        <Text selectable style={styles.detailText}>
                          {session.translatedTranscript ?? 'Not available yet.'}
                        </Text>

                        {session.transcriptionModel || session.translationModel ? (
                          <Text style={styles.models}>
                            {session.transcriptionModel ?? 'Unknown model'} →{' '}
                            {session.translationModel ?? 'Unknown model'}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </SectionCard>
        ) : (
      <AccountScreen
        user={user}
        localCompletedSessions={localCompletedSessions}
        localCompletedSeconds={localCompletedSeconds}
        onSignOut={signOut}
        onSync={async () => {
          const cloudSessions = await listCloudSessions();
          const count = await mergeCloudSessions(userId, cloudSessions);
          await refreshSessions();
          return count;
        }}
      />
        )}

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
    paddingBottom: 4,
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
  tabs: {
    backgroundColor: '#151b26',
    borderColor: '#293347',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingVertical: 11
  },
  tabActive: {
    backgroundColor: '#d6e7ff'
  },
  tabText: {
    color: '#9dacbf',
    fontSize: 13,
    fontWeight: '800'
  },
  tabTextActive: {
    color: '#142033'
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
  sessionId: {
    color: '#6f7d91',
    fontSize: 10
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
  emptyText: {
    color: '#9dacbf',
    fontSize: 14,
    lineHeight: 21
  },
  historyItem: {
    gap: 9
  },
  details: {
    backgroundColor: '#111923',
    borderColor: '#293347',
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    padding: 14
  },
  detailHeading: {
    color: '#f0f4f9',
    fontSize: 16,
    fontWeight: '800'
  },
  detailMeta: {
    color: '#8e9caf',
    fontSize: 12
  },
  detailLabel: {
    color: '#85b7ff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 4
  },
  detailText: {
    color: '#e6edf5',
    fontSize: 14,
    lineHeight: 21
  },
  errorBox: {
    backgroundColor: '#351c23',
    borderColor: '#6f2b38',
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    padding: 11
  },
  errorTitle: {
    color: '#ff9ca7',
    fontSize: 12,
    fontWeight: '800'
  },
  errorText: {
    color: '#ffd4d8',
    fontSize: 12,
    lineHeight: 18
  },
  footer: {
    color: '#69768a',
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 8,
    textAlign: 'center'
  }
});