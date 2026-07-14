import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { AviationSuiteApp } from './src/AviationSuiteApp';
import { AuthScreen } from './src/components/AuthScreen';

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

  return user ? <AviationSuiteApp user={user} signOut={signOut} /> : <AuthScreen />;
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
