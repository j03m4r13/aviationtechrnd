import { Pressable, StyleSheet, Text, View } from 'react-native';

import { languageLabel } from '../config/languages';
import type { RecordingSession, SessionStatus } from '../types/session';

type Props = {
  session: RecordingSession;
  isOpen: boolean;
  isPlaying: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onDelete: () => void;
};

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'recorded':
      return 'RECORDED';
    case 'processing':
      return 'PROCESSING';
    case 'completed':
      return 'COMPLETED';
    case 'failed':
      return 'FAILED';
  }
}

function statusStyle(status: SessionStatus) {
  switch (status) {
    case 'completed':
      return styles.statusCompleted;
    case 'processing':
      return styles.statusProcessing;
    case 'failed':
      return styles.statusFailed;
    case 'recorded':
      return styles.statusRecorded;
  }
}

export function SessionHistoryCard({
  session,
  isOpen,
  isPlaying,
  disabled = false,
  onOpen,
  onPlay,
  onDelete
}: Props) {
  const hasAudio = Boolean(session.audioUri);
  const preview =
    session.originalTranscript ||
    session.errorMessage ||
    (hasAudio
      ? 'Audio saved locally. No transcript has been generated yet.'
      : 'Cloud transcript metadata. Audio is not stored on this device.');

  return (
    <View style={[styles.card, isOpen && styles.cardOpen]}>
      <Pressable disabled={disabled} onPress={onOpen} style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.date}>{formatDate(session.createdAt)}</Text>
          <Text style={styles.meta}>
            {formatDuration(session.durationMs)} ·{' '}
            {languageLabel(session.sourceLanguage)} →{' '}
            {languageLabel(session.targetLanguage)}
          </Text>
        </View>
        <Text style={[styles.status, statusStyle(session.status)]}>
          {statusLabel(session.status)}
        </Text>
      </Pressable>

      <Text numberOfLines={isOpen ? 5 : 2} style={styles.preview}>
        {preview}
      </Text>

      <View style={styles.actions}>
        <Pressable
          disabled={disabled}
          onPress={onOpen}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{isOpen ? 'Close' : 'Open'}</Text>
        </Pressable>
        <Pressable
          disabled={disabled || !hasAudio}
          onPress={onPlay}
          style={({ pressed }) => [
            styles.action,
            !hasAudio && styles.disabledAction,
            pressed && styles.pressed
          ]}
        >
          <Text style={styles.actionText}>
            {hasAudio ? (isPlaying ? 'Pause' : 'Play') : 'Cloud only'}
          </Text>
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.action,
            styles.deleteAction,
            pressed && styles.pressed
          ]}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f141d',
    borderColor: '#293347',
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 13
  },
  cardOpen: {
    borderColor: '#85b7ff'
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  date: {
    color: '#eef3f8',
    fontSize: 14,
    fontWeight: '700'
  },
  meta: {
    color: '#8e9caf',
    fontSize: 12
  },
  status: {
    borderRadius: 999,
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  statusCompleted: {
    backgroundColor: '#163b2a',
    color: '#77e8a9'
  },
  statusProcessing: {
    backgroundColor: '#3d3217',
    color: '#ffd679'
  },
  statusFailed: {
    backgroundColor: '#441f27',
    color: '#ff9ca7'
  },
  statusRecorded: {
    backgroundColor: '#1f3047',
    color: '#9bc5ff'
  },
  preview: {
    color: '#c4cedb',
    fontSize: 13,
    lineHeight: 19
  },
  actions: {
    flexDirection: 'row',
    gap: 8
  },
  action: {
    backgroundColor: '#202939',
    borderColor: '#344159',
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8
  },
  deleteAction: {
    marginLeft: 'auto'
  },
  disabledAction: {
    opacity: 0.45
  },
  pressed: {
    opacity: 0.65
  },
  actionText: {
    color: '#d6e7ff',
    fontSize: 12,
    fontWeight: '800'
  },
  deleteText: {
    color: '#ff9ca7',
    fontSize: 12,
    fontWeight: '800'
  }
});
