import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { supabase } from '../auth/supabase';

type Mode = 'sign-in' | 'sign-up';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 8) {
      setMessage('Enter a valid email and a password of at least 8 characters.');
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        if (error) {
          throw error;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password
        });
        if (error) {
          throw error;
        }

        if (!data.session) {
          setMessage(
            'Account created. Check your email to confirm the account, then sign in.'
          );
          setMode('sign-in');
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>AVIATION VOICE SAAS</Text>
        <Text style={styles.title}>
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </Text>
        <Text style={styles.subtitle}>
          Your account owns cloud transcripts and processed-minute usage.
        </Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="pilot@example.com"
          placeholderTextColor="#687589"
          style={styles.input}
          value={email}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#687589"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          disabled={busy}
          onPress={() => void submit()}
          style={[styles.primary, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color="#142033" />
          ) : (
            <Text style={styles.primaryText}>
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setMessage(null);
          }}
        >
          <Text style={styles.switchText}>
            {mode === 'sign-in'
              ? 'New pilot? Create an account'
              : 'Already registered? Sign in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: '#0b0f16',
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  card: {
    backgroundColor: '#151b26',
    borderColor: '#293347',
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    maxWidth: 460,
    padding: 22,
    width: '100%'
  },
  eyebrow: {
    color: '#85b7ff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3
  },
  title: {
    color: '#f5f8fc',
    fontSize: 31,
    fontWeight: '800'
  },
  subtitle: {
    color: '#9dacbf',
    fontSize: 14,
    lineHeight: 20
  },
  input: {
    backgroundColor: '#0f141d',
    borderColor: '#344159',
    borderRadius: 12,
    borderWidth: 1,
    color: '#eef3f8',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  message: {
    color: '#ffd4a3',
    fontSize: 13,
    lineHeight: 19
  },
  primary: {
    alignItems: 'center',
    backgroundColor: '#d6e7ff',
    borderRadius: 12,
    minHeight: 50,
    justifyContent: 'center'
  },
  primaryText: {
    color: '#142033',
    fontSize: 15,
    fontWeight: '900'
  },
  switchText: {
    color: '#85b7ff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  disabled: {
    opacity: 0.55
  }
});
