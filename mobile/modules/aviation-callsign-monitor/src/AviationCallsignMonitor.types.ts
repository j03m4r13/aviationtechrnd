export type CallsignMonitorSource = 'VOSK' | 'WHISPER' | 'BOTH';

export type WhisperRuntimeState =
  | 'idle'
  | 'capturing'
  | 'queued'
  | 'completed'
  | 'empty'
  | 'failed';

export type CallsignMonitorConfig = {
  callsign: string;
  aliases?: string[];
  voskAssetDirectory?: string;
  whisperAssetFile?: string;
};

export type CallsignMonitorStatus = {
  initialized: boolean;
  monitoring: boolean;
  callsign: string;
  whisperModel: string | null;
  voskModel: string | null;
  whisperState?: WhisperRuntimeState;
  whisperQueuedCount?: number;
  whisperCompletedCount?: number;
  whisperEmptyCount?: number;
  lastWhisperSegmentMs?: number;
  lastWhisperQueueReason?: string | null;
};

export type CallsignTranscriptEvent = {
  source: 'VOSK_PARTIAL' | 'VOSK_FINAL' | 'WHISPER';
  transcript: string;
  normalized: string;
  score: number;
  timestamp: number;
};

export type CallsignAlertEvent = {
  target: string;
  transcript: string;
  normalized: string;
  source: CallsignMonitorSource;
  score: number;
  confirmed: boolean;
  notify: boolean;
  timestamp: number;
};

export type CallsignErrorEvent = {
  code: string;
  message: string;
};

export type CallsignStatusEvent = CallsignMonitorStatus & {
  message?: string;
};

export type CallsignMonitorEvents = {
  onCallsignAlert: (event: CallsignAlertEvent) => void;
  onTranscript: (event: CallsignTranscriptEvent) => void;
  onStatus: (event: CallsignStatusEvent) => void;
  onError: (event: CallsignErrorEvent) => void;
};
