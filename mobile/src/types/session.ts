export type SessionStatus =
  | 'recorded'
  | 'processing'
  | 'completed'
  | 'failed';

export type SyncStatus =
  | 'local_only'
  | 'pending_upload'
  | 'syncing'
  | 'synced'
  | 'sync_failed';

export type RecordingSession = {
  id: string;
  userId: string | null;
  cloudSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  audioUri: string | null;
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
  status: SessionStatus;
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncAt: string | null;
  idempotencyKey: string;
  originalTranscript: string | null;
  translatedTranscript: string | null;
  errorMessage: string | null;
  inputName: string | null;
  inputType: string | null;
  transcriptionModel: string | null;
  translationModel: string | null;
};

export type CreateRecordingSessionInput = {
  userId: string;
  audioUri: string;
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
  inputName: string | null;
  inputType: string | null;
};

export type CloudRecordingSession = {
  id: string;
  localSessionId: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  sourceLanguage: string;
  targetLanguage: string;
  status: SessionStatus;
  originalTranscript: string | null;
  translatedTranscript: string | null;
  errorMessage: string | null;
  inputName: string | null;
  inputType: string | null;
  transcriptionModel: string | null;
  translationModel: string | null;
};
