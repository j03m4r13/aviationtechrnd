import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import {
  getMonthlyUsage,
  type UsageSummary
} from '../services/cloud-api';
import { PrimaryButton } from './PrimaryButton';
import { SectionCard } from './SectionCard';

type Props = {
  user: User;

  // These two values come from the local SQLite history.
  localCompletedSessions: number;
  localCompletedSeconds: number;

  onSignOut: () => Promise<void>;
  onSync: () => Promise<number>;
};

function formatUsageDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} sec`;
  }

  const minutes = seconds / 60;

  if (minutes < 10) {
    return `${minutes.toFixed(1)} min`;
  }

  return `${Math.round(minutes)} min`;
}

export function AccountScreen({
  user,
  localCompletedSessions,
  localCompletedSeconds,
  onSignOut,
  onSync
}: Props) {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshUsage() {
    try {
      setUsage(await getMonthlyUsage());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load usage.'
      );
    }
  }

  useEffect(() => {
    void refreshUsage();
  }, []);

  async function sync() {
    setBusy(true);
    setMessage(null);

    try {
      const count = await onSync();
      await refreshUsage();

      setMessage(
        `Cloud synchronization completed. ${count} session(s) checked.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Cloud sync failed.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <SectionCard title="Account">
        <Text style={styles.label}>SIGNED IN AS</Text>

        <Text selectable style={styles.value}>
          {user.email ?? user.id}
        </Text>

        <Text style={styles.meta}>
          User ID: {user.id}
        </Text>
      </SectionCard>

      <SectionCard
        title="Current-month cloud usage"
        right={
          <Pressable onPress={() => void refreshUsage()}>
            <Text style={styles.link}>Refresh</Text>
          </Pressable>
        }
      >
        {usage ? (
          <>
            <Text style={styles.usage}>
              {formatUsageDuration(usage.processedSeconds)}
            </Text>

            <Text style={styles.meta}>
              {usage.completedJobs} completed cloud processing job(s)
              {' · '}
              {usage.month}
            </Text>

            <Text style={styles.explanation}>
              This is server-recorded billable usage. Older recordings
              processed before cloud usage tracking are not included.
            </Text>
          </>
        ) : (
          <Text style={styles.meta}>
            Usage has not been loaded yet.
          </Text>
        )}
      </SectionCard>

      {/* Add the new card here, after cloud usage and before cloud sync. */}
      <SectionCard title="Local history">
        <Text style={styles.usage}>
          {localCompletedSessions}
        </Text>

        <Text style={styles.meta}>
          completed local session
          {localCompletedSessions === 1 ? '' : 's'}
          {' · '}
          {formatUsageDuration(localCompletedSeconds)} recorded
        </Text>

        <Text style={styles.explanation}>
          This includes completed sessions stored in SQLite on this phone.
          Older local sessions may not have corresponding cloud usage records.
        </Text>
      </SectionCard>

      <SectionCard title="Cloud synchronization">
        <Text style={styles.meta}>
          Sync transcript metadata from the server. Audio remains local
          in this milestone.
        </Text>

        <PrimaryButton
          label="Sync cloud history"
          loading={busy}
          onPress={() => void sync()}
        />

        {message ? (
          <Text style={styles.message}>
            {message}
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard title="Session">
        <PrimaryButton
          danger
          label="Sign out"
          onPress={() => {
            Alert.alert(
              'Sign out?',
              'Local recordings remain on this device.',
              [
                {
                  text: 'Cancel',
                  style: 'cancel'
                },
                {
                  text: 'Sign out',
                  style: 'destructive',
                  onPress: () => void onSignOut()
                }
              ]
            );
          }}
        />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14
  },

  label: {
    color: '#6f7d91',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1
  },

  value: {
    color: '#eef3f8',
    fontSize: 16,
    fontWeight: '700'
  },

  meta: {
    color: '#8e9caf',
    fontSize: 12,
    lineHeight: 18
  },

  explanation: {
    color: '#6f7d91',
    fontSize: 11,
    lineHeight: 17
  },

  usage: {
    color: '#77e8a9',
    fontSize: 34,
    fontWeight: '900'
  },

  link: {
    color: '#85b7ff',
    fontSize: 13,
    fontWeight: '700'
  },

  message: {
    color: '#dbe4ef',
    fontSize: 13,
    lineHeight: 19
  }
});