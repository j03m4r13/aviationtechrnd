import type { User } from '@supabase/supabase-js';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { AviationVoiceApp } from './AviationVoiceApp';
import { PilotPayCalculatorScreen } from './components/PilotPayCalculatorScreen';

type ToolScreen = 'voice' | 'pay';

type Props = {
  user: User;
  signOut: () => Promise<void>;
};

export function AviationSuiteApp({ user, signOut }: Props) {
  const [tool, setTool] = useState<ToolScreen>('voice');

  return (
    <View style={styles.root}>
      <View style={styles.toolBar}>
        <Pressable
          onPress={() => setTool('voice')}
          style={[styles.toolButton, tool === 'voice' && styles.toolButtonActive]}
        >
          <Text
            style={[
              styles.toolButtonText,
              tool === 'voice' && styles.toolButtonTextActive
            ]}
          >
            Voice
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTool('pay')}
          style={[styles.toolButton, tool === 'pay' && styles.toolButtonActive]}
        >
          <Text
            style={[
              styles.toolButtonText,
              tool === 'pay' && styles.toolButtonTextActive
            ]}
          >
            Pay estimate
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {tool === 'voice' ? (
          <AviationVoiceApp signOut={signOut} user={user} />
        ) : (
          <PilotPayCalculatorScreen />
        )}
      </View>
    </View>
  );
}

const topInset =
  Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0;

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0b0f16',
    flex: 1
  },
  toolBar: {
    backgroundColor: '#0d131d',
    borderBottomColor: '#293347',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: topInset + 8
  },
  toolButton: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  toolButtonActive: {
    backgroundColor: '#d6e7ff'
  },
  toolButtonText: {
    color: '#8f9db0',
    fontSize: 13,
    fontWeight: '800'
  },
  toolButtonTextActive: {
    color: '#142033'
  },
  content: {
    flex: 1
  }
});
