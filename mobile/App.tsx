import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  PermissionsAndroid,
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
type MicrophonePermissionState = 'checking' | 'granted' | 'denied' | 'blocked';

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

function FlightWorkspace({ ownerUserId }: { ownerUserId: string }) {
  const [permissionState, setPermissionState] =
    useState<MicrophonePermissionState>('checking');
  const [requestingPermission, setRequestingPermission] = useState(false);

  const refreshPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setPermissionState('granted');
      return true;
    }

    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      setPermissionState(granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      setPermissionState('denied');
      return false;
    }
  }, []);

  useEffect(() => {
    void refreshPermission();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPermission();
      }
    });

    return () => subscription.remove();
  }, [refreshPermission]);

  async function requestMicrophonePermission() {
    if (Platform.OS !== 'android') {
      setPermissionState('granted');
      return;
    }

    try {
      setRequestingPermission(true);

      if (await refreshPermission()) {
        return;
      }

      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone access required',
          message:
            'Pilot Workspace needs microphone access for callsign monitoring and flight recording.',
          buttonPositive: 'Allow microphone',
          buttonNegative: 'Not now'
        }
      );

      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        setPermissionState('granted');
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        setPermissionState('blocked');
      } else {
        setPermissionState('denied');
      }
    } catch (error) {
      Alert.alert(
        'Unable to request microphone access',
        error instanceof Error ? error.message : 'Open Android settings and allow the microphone.'
      );
    } finally {
      setRequestingPermission(false);
    }
  }

  if (permissionState === 'checking') {
    return (
      <View style={styles.permissionLoading}>
        <ActivityIndicator color="#85b7ff" size="large" />
        <Text style={styles.permissionLoadingText}>Checking microphone access…</Text>
      </View>
    );
  }

  if (permissionState === 'granted') {
    return <CallsignMonitorApp embedded ownerUserId={ownerUserId} />;
  }

  const permissionBlocked = permissionState === 'blocked';

  return (
    <View style={styles.permissionPage}>
      <View style={styles.permissionCard}>
        <Text style={styles.permissionEyebrow}>FLIGHT AUDIO</Text>
        <Text style={styles.permissionTitle}>Microphone access required</Text>
        <Text style={styles.permissionText}>
          Callsign monitoring and flight recording both use the Android microphone. Audio
          processing cannot start until this permission is enabled.
        </Text>

        {permissionBlocked ? (
          <Text style={styles.permissionWarning}>
            Android is no longer showing the permission prompt because microphone access was
            previously blocked. Open the app settings and set Microphone to Allow.
          </Text>
        ) : null}

        <Pressable
          disabled={requestingPermission}
          onPress={() =>
            void (permissionBlocked
              ? Linking.openSettings()
              : requestMicrophonePermission())
          }
          style={[
            styles.permissionButton,
            requestingPermission && styles.permissionButtonDisabled
          ]}
        >
          {requestingPermission ? (
            <ActivityIndicator color="#142033" size="small" />
          ) : (
            <Text style={styles.permissionButtonText}>
              {permissionBlocked ? 'Open app settings' : 'Enable microphone'}
            </Text>
          )}
        </Pressable>

        <Pressable onPress={() => void refreshPermission()} style={styles.permissionCheckButton}>
          <Text style={styles.permissionCheckText}>Check permission again</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
          <FlightWorkspace ownerUserId={user.id} />
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
  },
  permissionLoading: {
    alignItems: 'center',
    backgroundColor: '#0b0f16',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24
  },
  permissionLoadingText: {
    color: '#9dacbf',
    fontSize: 14
  },
  permissionPage: {
    backgroundColor: '#0b0f16',
    flex: 1,
    justifyContent: 'center',
    padding: 18
  },
  permissionCard: {
    backgroundColor: '#111923',
    borderColor: '#30425b',
    borderRadius: 16,
    borderWidth: 1,
    gap: 13,
    padding: 18
  },
  permissionEyebrow: {
    color: '#85b7ff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  permissionTitle: {
    color: '#f5f8fc',
    fontSize: 23,
    fontWeight: '800'
  },
  permissionText: {
    color: '#aeb9c8',
    fontSize: 14,
    lineHeight: 21
  },
  permissionWarning: {
    backgroundColor: '#2a2112',
    borderColor: '#69551a',
    borderRadius: 10,
    borderWidth: 1,
    color: '#ffd27d',
    fontSize: 12,
    lineHeight: 18,
    padding: 11
  },
  permissionButton: {
    alignItems: 'center',
    backgroundColor: '#d6e7ff',
    borderRadius: 11,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  permissionButtonDisabled: {
    opacity: 0.5
  },
  permissionButtonText: {
    color: '#142033',
    fontSize: 14,
    fontWeight: '900'
  },
  permissionCheckButton: {
    alignItems: 'center',
    paddingVertical: 6
  },
  permissionCheckText: {
    color: '#85b7ff',
    fontSize: 12,
    fontWeight: '700'
  }
});