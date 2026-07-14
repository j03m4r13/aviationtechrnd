import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  claimLegacySessions,
  initializeSessionDatabase,
  listRecordingSessions,
  mergeCloudSessions
} from '../database/session-repository';
import { listCloudSessions } from '../services/cloud-api';
import { AccountScreen } from './AccountScreen';

type Props = {
  user: User;
  onSignOut: () => Promise<void>;
};

const topInset =
  Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 22;

export function AccountWorkspaceScreen({ user, onSignOut }: Props) {
  const [localCompletedSessions, setLocalCompletedSessions] = useState(0);
  const [localCompletedSeconds, setLocalCompletedSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshLocalHistory = useCallback(async () => {
    await initializeSessionDatabase();
    await claimLegacySessions(user.id);
    const sessions = await listRecordingSessions(user.id);
    const completed = sessions.filter((session) => session.status === 'completed');

    setLocalCompletedSessions(completed.length);
    setLocalCompletedSeconds(
      Math.round(
        completed.reduce((total, session) => total + session.durationMs, 0) / 1000
      )
    );
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;

    void refreshLocalHistory()
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setReady(true);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Unable to open the local recording history.'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshLocalHistory]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>PROFILE · USAGE · CLOUD HISTORY</Text>
          <Text style={styles.title}>Account</Text>
          <Text style={styles.subtitle}>
            Review your signed-in account, usage, local history, cloud sync, and
            session controls.
          </Text>
        </View>

        {!ready ? (
          <Text style={styles.status}>Opening account data…</Text>
        ) : errorMessage ? (
          <Text style={styles.error}>{errorMessage}</Text>
        ) : null}

        <AccountScreen
          user={user}
          localCompletedSessions={localCompletedSessions}
          localCompletedSeconds={localCompletedSeconds}
          onSignOut={onSignOut}
          onSync={async () => {
            const cloudSessions = await listCloudSessions();
            const count = await mergeCloudSessions(user.id, cloudSessions);
            await refreshLocalHistory();
            return count;
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0b0f16',
    flex: 1
  },
  content: {
    gap: 14,
    paddingBottom: 48,
    paddingHorizontal: 16,
    paddingTop: 18
  },
  hero: {
    gap: 6,
    paddingBottom: 2
  },
  eyebrow: {
    color: '#85b7ff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  title: {
    color: '#f5f8fc',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6
  },
  subtitle: {
    color: '#9dacbf',
    fontSize: 14,
    lineHeight: 21
  },
  status: {
    color: '#9dacbf',
    fontSize: 13,
    lineHeight: 19
  },
  error: {
    backgroundColor: '#351c23',
    borderColor: '#6f2b38',
    borderRadius: 10,
    borderWidth: 1,
    color: '#ffd4d8',
    fontSize: 12,
    lineHeight: 18,
    padding: 11
  }
});
