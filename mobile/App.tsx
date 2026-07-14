import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { AuthScreen } from './src/components/AuthScreen';
import { AviationVoiceApp } from './src/AviationVoiceApp';

function AppGate() {
  const { loading, user, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#85b7ff" size="large" />
        <Text style={styles.loadingText}>Restoring secure session…</Text>
      </View>
    );
  }

  return user ? <AviationVoiceApp user={user} signOut={signOut} /> : <AuthScreen />;
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
  }
});