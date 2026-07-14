import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import AviationCallsignMonitor from './modules/aviation-callsign-monitor';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { CallsignMonitorApp } from './src/CallsignMonitorApp';
import { AccountWorkspaceScreen } from './src/components/AccountWorkspaceScreen';
import { AuthScreen } from './src/components/AuthScreen';
import { PilotPayEstimatorScreen } from './src/components/PilotPayEstimatorScreen';

type SuiteScreen = 'flight' | 'pay' | 'account';

type NavigationItem = {
  label: string;
  value: SuiteScreen;
};

const NAVIGATION_ITEMS: NavigationItem[] = [
  { label: 'Flight', value: 'flight' },
  { label: 'Pay', value: 'pay' },
  { label: 'Account', value: 'account' }
];

const topInset =
  Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0;

function AppGate() {
  const { loading, user, signOut } = useAuth();
  const [screen, setScreen] = useState<SuiteScreen>('flight');
  const [checkingAudio, setCheckingAudio] = useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#85b7ff" size="large" />
        <Text style={styles.loadingText}>Restoring secure session…</Text>
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  async function selectScreen(nextScreen: SuiteScreen) {
    if (nextScreen === screen || checkingAudio) {
      return;
    }

    if (screen === 'flight' && nextScreen !== 'flight') {
      try {
        setCheckingAudio(true);
        const [monitorStatus, flightStatus] = await Promise.all([
          AviationCallsignMonitor.getStatus(),
          AviationCallsignMonitor.getFlightSessionStatus()
        ]);

        if (monitorStatus.monitoring || flightStatus.active) {
          Alert.alert(
            'Flight audio is still active',
            monitorStatus.monitoring
              ? 'Stop callsign monitoring before opening another screen.'
              : 'Stop the active flight recording before opening another screen.'
          );
          return;
        }
      } catch (error) {
        Alert.alert(
          'Unable to verify microphone status',
          error instanceof Error
            ? error.message
            : 'Check the flight-audio screen before switching.'
        );
        return;
      } finally {
        setCheckingAudio(false);
      }
    }

    setScreen(nextScreen);
  }

  return (
    <View style={styles.shell}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.brandEyebrow}>AVIATION TOOLKIT</Text>
            <Text style={styles.brandTitle}>Pilot Workspace</Text>
          </View>
          {checkingAudio ? <ActivityIndicator color="#85b7ff" size="small" /> : null}
        </View>

        <View style={styles.navigation}>
          {NAVIGATION_ITEMS.map((item) => {
            const active = item.value === screen;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                key={item.value}
                onPress={() => void selectScreen(item.value)}
                style={[styles.navButton, active && styles.navButtonActive]}
              >
                <Text style={[styles.navText, active && styles.navTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.content}>
        {screen === 'flight' ? (
          <CallsignMonitorApp embedded ownerUserId={user.id} />
        ) : screen === 'pay' ? (
          <PilotPayEstimatorScreen />
        ) : (
          <AccountWorkspaceScreen onSignOut={signOut} user={user} />
        )}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: '#0b0f16',
    flex: 1,
    gap: 14,
    justifyContent: 'center'
  },
  loadingText: {
    color: '#9dacbf',
    fontSize: 14
  },
  shell: {
    backgroundColor: '#0b0f16',
    flex: 1
  },
  header: {
    backgroundColor: '#0d131d',
    borderBottomColor: '#293347',
    borderBottomWidth: 1,
    gap: 9,
    paddingBottom: 9,
    paddingHorizontal: 12,
    paddingTop: topInset + 8
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2
  },
  brandEyebrow: {
    color: '#6f91bd',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  brandTitle: {
    color: '#f5f8fc',
    fontSize: 18,
    fontWeight: '800'
  },
  navigation: {
    backgroundColor: '#151b26',
    borderColor: '#293347',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 4
  },
  navButton: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    minHeight: 39,
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 8
  },
  navButtonActive: {
    backgroundColor: '#d6e7ff'
  },
  navText: {
    color: '#98a6b9',
    fontSize: 12,
    fontWeight: '800'
  },
  navTextActive: {
    color: '#142033'
  },
  content: {
    flex: 1
  }
});
