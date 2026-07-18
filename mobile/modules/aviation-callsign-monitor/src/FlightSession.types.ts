export type FlightSessionStatus = {
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

export type FlightSessionSummary = Omit<FlightSessionStatus, 'active' | 'message'> & {
  startedAtEpochMs: number;
  endedAtEpochMs: number | null;
  recordingExists: boolean;
  transcriptStatus?: string | null;
  transcriptFile?: string | null;
  transcriptText?: string | null;
  transcriptionModel?: string | null;
  translationStatus?: string | null;
  translationFile?: string | null;
  translationText?: string | null;
  translationModel?: string | null;
  translationTargetLanguage?: string | null;
  cloudSessionId?: string | null;
};
