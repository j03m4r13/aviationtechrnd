import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

import type {
  CallsignAlertEvent,
  CallsignErrorEvent,
  CallsignMonitorConfig,
  CallsignMonitorStatus,
  CallsignStatusEvent,
  CallsignTranscriptEvent
} from './AviationCallsignMonitor.types';
import type {
  FlightSessionStatus,
  FlightSessionSummary
} from './FlightSession.types';

type FlightProcessingPayload = {
  ownerUserId: string;
  sessionId: string;
  transcript: string;
  translation: string;
  sourceLanguage: string;
  targetLanguage: string;
  cloudSessionId: string;
  transcriptionModel: string;
  translationModel: string;
};

type NativeCallsignModule = {
  initialize(
    callsign: string,
    aliases: string[],
    voskAssetDirectory: string,
    whisperAssetFile: string
  ): Promise<CallsignMonitorStatus>;
  startMonitoring(): Promise<CallsignMonitorStatus>;
  stopMonitoring(): Promise<CallsignMonitorStatus>;
  setCallsign(callsign: string, aliases: string[]): Promise<CallsignMonitorStatus>;
  startFlightSession(ownerUserId: string): Promise<FlightSessionStatus>;
  stopFlightSession(): Promise<FlightSessionStatus>;
  getFlightSessionStatus(): Promise<FlightSessionStatus>;
  listFlightSessions(ownerUserId: string): Promise<FlightSessionSummary[]>;
  saveFlightSessionProcessingResult(
    payload: FlightProcessingPayload
  ): Promise<FlightSessionSummary>;
  testAlert(confirmed: boolean): Promise<{
    success: boolean;
    confirmed: boolean;
  }>;
  getStatus(): Promise<CallsignMonitorStatus>;
  addListener(
    eventName: 'onCallsignAlert',
    listener: (event: CallsignAlertEvent) => void
  ): EventSubscription;
  addListener(
    eventName: 'onTranscript',
    listener: (event: CallsignTranscriptEvent) => void
  ): EventSubscription;
  addListener(
    eventName: 'onStatus',
    listener: (event: CallsignStatusEvent) => void
  ): EventSubscription;
  addListener(
    eventName: 'onError',
    listener: (event: CallsignErrorEvent) => void
  ): EventSubscription;
};

const NativeModule = requireNativeModule<NativeCallsignModule>(
  'AviationCallsignMonitor'
);

const DEFAULT_VOSK_ASSET_DIRECTORY =
  'models/vosk-model-small-en-us-0.15';
const DEFAULT_WHISPER_ASSET_FILE = 'models/ggml-small.en-q5_1.bin';

export async function initialize(
  config: CallsignMonitorConfig
): Promise<CallsignMonitorStatus> {
  const callsign = config.callsign.trim();
  if (!callsign) {
    throw new Error('A callsign is required.');
  }

  return NativeModule.initialize(
    callsign,
    config.aliases ?? [],
    config.voskAssetDirectory ?? DEFAULT_VOSK_ASSET_DIRECTORY,
    config.whisperAssetFile ?? DEFAULT_WHISPER_ASSET_FILE
  );
}

export const startMonitoring = () => NativeModule.startMonitoring();
export const stopMonitoring = () => NativeModule.stopMonitoring();
export const getStatus = () => NativeModule.getStatus();
export const setCallsign = (callsign: string, aliases: string[] = []) =>
  NativeModule.setCallsign(callsign, aliases);
export const startFlightSession = (ownerUserId: string) =>
  NativeModule.startFlightSession(ownerUserId);
export const stopFlightSession = () => NativeModule.stopFlightSession();
export const getFlightSessionStatus = () =>
  NativeModule.getFlightSessionStatus();
export const listFlightSessions = (ownerUserId: string) =>
  NativeModule.listFlightSessions(ownerUserId);
export const saveFlightSessionProcessingResult = (
  ownerUserId: string,
  sessionId: string,
  transcript: string,
  translation: string,
  sourceLanguage: string,
  targetLanguage: string,
  cloudSessionId: string,
  transcriptionModel: string,
  translationModel: string
) =>
  NativeModule.saveFlightSessionProcessingResult({
    ownerUserId,
    sessionId,
    transcript,
    translation,
    sourceLanguage,
    targetLanguage,
    cloudSessionId,
    transcriptionModel,
    translationModel
  });
export const testAlert = (confirmed: boolean) =>
  NativeModule.testAlert(confirmed);

export const addCallsignAlertListener = (
  listener: (event: CallsignAlertEvent) => void
) => NativeModule.addListener('onCallsignAlert', listener);

export const addTranscriptListener = (
  listener: (event: CallsignTranscriptEvent) => void
) => NativeModule.addListener('onTranscript', listener);

export const addStatusListener = (
  listener: (event: CallsignStatusEvent) => void
) => NativeModule.addListener('onStatus', listener);

export const addErrorListener = (
  listener: (event: CallsignErrorEvent) => void
) => NativeModule.addListener('onError', listener);

export default {
  initialize,
  startMonitoring,
  stopMonitoring,
  getStatus,
  setCallsign,
  startFlightSession,
  stopFlightSession,
  getFlightSessionStatus,
  listFlightSessions,
  saveFlightSessionProcessingResult,
  testAlert,
  addCallsignAlertListener,
  addTranscriptListener,
  addStatusListener,
  addErrorListener
};
