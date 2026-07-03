import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { AuthScreen } from './src/components/AuthScreen';
import { AviationVoiceApp } from './src/AviationVoiceApp';
import { CallsignMonitorApp } from './src/CallsignMonitorApp';

type AviationTool = 'recorder' | 'callsign';

function AppGate() {
  const { loading, user, signOut } = useAuth();
  const [tool, setTool] = useState<AviationTool>('recorder');

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

  function selectTool(nextTool: AviationTool) {
    if (tool === nextTool) {
      return;
    }

    if (tool === 'recorder' && nextTool === 'callsign') {
      Alert.alert(
        'Switch to callsign monitoring?',
        'Stop any active recording first. The callsign monitor becomes the only microphone owner while it is open.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch tools', onPress: () => setTool(nextTool) }
        ]
      );
      return;
    }

    setTool(nextTool);
  }

  return (
    <View style={styles.shell}>
      <View style={styles.toolBar}>
        <Pressable
          onPress={() => selectTool('recorder')}
          style={[styles.toolButton, tool === 'recorder' && styles.toolButtonActive]}
        >
          <Text
            style={[
              styles.toolButtonText,
              tool === 'recorder' && styles.toolButtonTextActive
            ]}
          >
            Recorder & Translation
          </Text>
        </Pressable>

        <Pressable
          onPress={() => selectTool('callsign')}
          style={[styles.toolButton, tool === 'callsign' && styles.toolButtonActive]}
        >
          <Text
            style={[
              styles.toolButtonText,
              tool === 'callsign' && styles.toolButtonTextActive
            ]}
          >
            Callsign Monitor
          </Text>
        </Pressable>
      </View>

      <View style={styles.toolContent}>
        {tool === 'recorder' ? (
          <AviationVoiceApp user={user} signOut={signOut} />
        ) : (
          <CallsignMonitorApp />
        )}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
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
  toolBar: {
    backgroundColor: '#0f1622',
    borderBottomColor: '#293347',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 10
  },
  toolButton: {
    alignItems: 'center',
    borderColor: '#334155',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  toolButtonActive: {
    backgroundColor: '#d6e7ff',
    borderColor: '#d6e7ff'
  },
  toolButtonText: {
    color: '#9dacbf',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  toolButtonTextActive: {
    color: '#142033'
  },
  toolContent: {
    flex: 1
  }
});
