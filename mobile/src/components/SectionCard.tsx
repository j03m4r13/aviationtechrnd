import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = PropsWithChildren<{
  title: string;
  right?: ReactNode;
}>;

export function SectionCard({ title, right, children }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#151b26',
    borderColor: '#293347',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  title: {
    color: '#f4f7fb',
    fontSize: 17,
    fontWeight: '700'
  }
});
