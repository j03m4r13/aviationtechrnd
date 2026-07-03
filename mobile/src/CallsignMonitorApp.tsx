import {
  Platform,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CallsignAlertTestPanel } from './components/CallsignAlertTestPanel';
import { CallsignMonitorPanel } from './components/CallsignMonitorPanel';
import { CallsignRecognizerDiagnostics } from './components/CallsignRecognizerDiagnostics';

const topInset =
  Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) + 12 : 22;

export function CallsignMonitorApp() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>HIGH-ACCURACY OFFLINE MODE · ANDROID</Text>
          <Text style={styles.title}>Callsign Monitor</Text>
          <Text style={styles.subtitle}>
            Vosk listens continuously while whisper.cpp checks every completed
            transmission. All recognition stays on the phone.
          </Text>
        </View>

        <CallsignMonitorPanel />
        <CallsignAlertTestPanel />
        <CallsignRecognizerDiagnostics />

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Operational limitation</Text>
          <Text style={styles.noticeText}>
            This is an experimental attention aid, not certified avionics. It
            must not replace listening to ATC or normal cockpit procedures.
          </Text>
        </View>
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
    paddingBottom: 40,
    paddingHorizontal: 16,
    paddingTop: topInset
  },
  hero: {
    gap: 6,
    paddingBottom: 4
  },
  eyebrow: {
    color: '#85b7ff',
    fontSize: 11,
    fontWeight: '800',
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
    fontSize: 15,
    lineHeight: 21
  },
  notice: {
    backgroundColor: '#211b0f',
    borderColor: '#66501d',
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 14
  },
  noticeTitle: {
    color: '#ffd27a',
    fontSize: 14,
    fontWeight: '800'
  },
  noticeText: {
    color: '#d8c59e',
    fontSize: 13,
    lineHeight: 19
  }
});
