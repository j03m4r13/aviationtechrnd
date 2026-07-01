import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import type { ProcessingResult } from '../types/audio';
import type {
  CloudRecordingSession,
  CreateRecordingSessionInput,
  RecordingSession,
  SessionStatus,
  SyncStatus
} from '../types/session';

type SessionRow = {
  id: string;
  user_id: string | null;
  cloud_session_id: string | null;
  created_at: string;
  updated_at: string;
  audio_uri: string | null;
  duration_ms: number;
  source_language: string;
  target_language: string;
  status: SessionStatus;
  sync_status: SyncStatus;
  sync_error: string | null;
  last_sync_at: string | null;
  idempotency_key: string;
  original_transcript: string | null;
  translated_transcript: string | null;
  error_message: string | null;
  input_name: string | null;
  input_type: string | null;
  transcription_model: string | null;
  translation_model: string | null;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function mapRow(row: SessionRow): RecordingSession {
  return {
    id: row.id,
    userId: row.user_id,
    cloudSessionId: row.cloud_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audioUri: row.audio_uri,
    durationMs: row.duration_ms,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    status: row.status,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    lastSyncAt: row.last_sync_at,
    idempotencyKey: row.idempotency_key,
    originalTranscript: row.original_transcript,
    translatedTranscript: row.translated_transcript,
    errorMessage: row.error_message,
    inputName: row.input_name,
    inputType: row.input_type,
    transcriptionModel: row.transcription_model,
    translationModel: row.translation_model
  };
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('aviation-voice.db');
  }
  return databasePromise;
}

async function addColumnIfMissing(
  db: SQLite.SQLiteDatabase,
  name: string,
  declaration: string
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(recording_sessions)'
  );
  if (!columns.some((column) => column.name === name)) {
    await db.execAsync(
      `ALTER TABLE recording_sessions ADD COLUMN ${name} ${declaration}`
    );
  }
}

export async function initializeSessionDatabase(): Promise<void> {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS recording_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
      cloud_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      audio_uri TEXT,
      duration_ms INTEGER NOT NULL,
      source_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      status TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'local_only',
      sync_error TEXT,
      last_sync_at TEXT,
      idempotency_key TEXT NOT NULL DEFAULT '',
      original_transcript TEXT,
      translated_transcript TEXT,
      error_message TEXT,
      input_name TEXT,
      input_type TEXT,
      transcription_model TEXT,
      translation_model TEXT
    );
  `);

  await addColumnIfMissing(db, 'user_id', 'TEXT');
  await addColumnIfMissing(db, 'cloud_session_id', 'TEXT');
  await addColumnIfMissing(db, 'sync_status', "TEXT NOT NULL DEFAULT 'local_only'");
  await addColumnIfMissing(db, 'sync_error', 'TEXT');
  await addColumnIfMissing(db, 'last_sync_at', 'TEXT');
  await addColumnIfMissing(db, 'idempotency_key', "TEXT NOT NULL DEFAULT ''");

  await db.execAsync(`
    UPDATE recording_sessions
       SET idempotency_key = 'legacy_' || id
     WHERE idempotency_key IS NULL OR idempotency_key = '';

    UPDATE recording_sessions
       SET status = 'failed',
           sync_status = 'sync_failed',
           error_message = COALESCE(error_message, 'Processing was interrupted before the app restarted.'),
           sync_error = COALESCE(sync_error, 'Processing was interrupted before the app restarted.'),
           updated_at = datetime('now')
     WHERE status = 'processing';

    CREATE INDEX IF NOT EXISTS idx_recording_sessions_user_created
      ON recording_sessions(user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recording_sessions_cloud_id
      ON recording_sessions(cloud_session_id)
      WHERE cloud_session_id IS NOT NULL;
  `);
}

export async function claimLegacySessions(userId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recording_sessions
        SET user_id = ?, updated_at = ?
      WHERE user_id IS NULL`,
    [userId, new Date().toISOString()]
  );
}

export async function createRecordingSession(
  input: CreateRecordingSessionInput
): Promise<RecordingSession> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = Crypto.randomUUID();
  const session: RecordingSession = {
    id,
    userId: input.userId,
    cloudSessionId: null,
    createdAt: now,
    updatedAt: now,
    audioUri: input.audioUri,
    durationMs: input.durationMs,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    status: 'recorded',
    syncStatus: 'pending_upload',
    syncError: null,
    lastSyncAt: null,
    idempotencyKey: `process_${id}_${input.sourceLanguage}_${input.targetLanguage}_v1`,
    originalTranscript: null,
    translatedTranscript: null,
    errorMessage: null,
    inputName: input.inputName,
    inputType: input.inputType,
    transcriptionModel: null,
    translationModel: null
  };

  await db.runAsync(
    `INSERT INTO recording_sessions (
       id, user_id, cloud_session_id, created_at, updated_at, audio_uri,
       duration_ms, source_language, target_language, status,
       sync_status, sync_error, last_sync_at, idempotency_key,
       original_transcript, translated_transcript, error_message,
       input_name, input_type, transcription_model, translation_model
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.userId,
      session.cloudSessionId,
      session.createdAt,
      session.updatedAt,
      session.audioUri,
      session.durationMs,
      session.sourceLanguage,
      session.targetLanguage,
      session.status,
      session.syncStatus,
      session.syncError,
      session.lastSyncAt,
      session.idempotencyKey,
      session.originalTranscript,
      session.translatedTranscript,
      session.errorMessage,
      session.inputName,
      session.inputType,
      session.transcriptionModel,
      session.translationModel
    ]
  );

  return session;
}

export async function listRecordingSessions(
  userId: string,
  limit = 100
): Promise<RecordingSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT *
       FROM recording_sessions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

export async function markSessionProcessing(
  sessionId: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<string> {
  const db = await getDatabase();
  const idempotencyKey = `process_${sessionId}_${sourceLanguage}_${targetLanguage}_v1`;
  await db.runAsync(
    `UPDATE recording_sessions
        SET source_language = ?, target_language = ?, status = 'processing',
            sync_status = 'syncing', sync_error = NULL, error_message = NULL,
            idempotency_key = ?, updated_at = ?
      WHERE id = ?`,
    [
      sourceLanguage,
      targetLanguage,
      idempotencyKey,
      new Date().toISOString(),
      sessionId
    ]
  );
  return idempotencyKey;
}

export async function completeRecordingSession(
  sessionId: string,
  result: ProcessingResult,
  cloudSessionId: string
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE recording_sessions
        SET cloud_session_id = ?, source_language = ?, target_language = ?,
            status = 'completed', sync_status = 'synced', sync_error = NULL,
            last_sync_at = ?, original_transcript = ?, translated_transcript = ?,
            error_message = NULL, transcription_model = ?, translation_model = ?,
            updated_at = ?
      WHERE id = ?`,
    [
      cloudSessionId,
      result.sourceLanguage,
      result.targetLanguage,
      now,
      result.transcript,
      result.translation,
      result.models.transcription,
      result.models.translation,
      now,
      sessionId
    ]
  );
}

export async function failRecordingSession(
  sessionId: string,
  errorMessage: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE recording_sessions
        SET status = 'failed', sync_status = 'sync_failed',
            error_message = ?, sync_error = ?, updated_at = ?
      WHERE id = ?`,
    [errorMessage, errorMessage, new Date().toISOString(), sessionId]
  );
}

export async function mergeCloudSessions(
  userId: string,
  cloudSessions: CloudRecordingSession[]
): Promise<number> {
  const db = await getDatabase();
  let merged = 0;

  await db.withTransactionAsync(async () => {
    for (const cloud of cloudSessions) {
      const existing = await db.getFirstAsync<{ id: string; audio_uri: string | null }>(
        `SELECT id, audio_uri FROM recording_sessions WHERE id = ? AND user_id = ?`,
        [cloud.localSessionId, userId]
      );

      if (existing) {
        await db.runAsync(
          `UPDATE recording_sessions
              SET cloud_session_id = ?, updated_at = ?, duration_ms = ?,
                  source_language = ?, target_language = ?, status = ?,
                  sync_status = 'synced', sync_error = NULL, last_sync_at = ?,
                  original_transcript = ?, translated_transcript = ?,
                  error_message = ?, input_name = ?, input_type = ?,
                  transcription_model = ?, translation_model = ?
            WHERE id = ? AND user_id = ?`,
          [
            cloud.id,
            cloud.updatedAt,
            cloud.durationMs,
            cloud.sourceLanguage,
            cloud.targetLanguage,
            cloud.status,
            new Date().toISOString(),
            cloud.originalTranscript,
            cloud.translatedTranscript,
            cloud.errorMessage,
            cloud.inputName,
            cloud.inputType,
            cloud.transcriptionModel,
            cloud.translationModel,
            cloud.localSessionId,
            userId
          ]
        );
      } else {
        await db.runAsync(
          `INSERT INTO recording_sessions (
             id, user_id, cloud_session_id, created_at, updated_at, audio_uri,
             duration_ms, source_language, target_language, status,
             sync_status, sync_error, last_sync_at, idempotency_key,
             original_transcript, translated_transcript, error_message,
             input_name, input_type, transcription_model, translation_model
           ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'synced', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cloud.localSessionId,
            userId,
            cloud.id,
            cloud.createdAt,
            cloud.updatedAt,
            cloud.durationMs,
            cloud.sourceLanguage,
            cloud.targetLanguage,
            cloud.status,
            new Date().toISOString(),
            `cloud_${cloud.id}`,
            cloud.originalTranscript,
            cloud.translatedTranscript,
            cloud.errorMessage,
            cloud.inputName,
            cloud.inputType,
            cloud.transcriptionModel,
            cloud.translationModel
          ]
        );
      }
      merged += 1;
    }
  });

  return merged;
}

export async function deleteRecordingSession(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM recording_sessions WHERE id = ?', [sessionId]);
}
