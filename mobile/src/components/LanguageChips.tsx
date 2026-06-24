import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LanguageOption } from '../types/audio';

type Props = {
  label: string;
  options: LanguageOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function LanguageChips({
  label,
  options,
  value,
  onChange,
  disabled = false
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.row}
        showsHorizontalScrollIndicator={false}
      >
        {options.map((option) => {
          const selected = option.code === value;

          return (
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              key={option.code}
              onPress={() => onChange(option.code)}
              style={[
                styles.chip,
                selected && styles.chipSelected,
                disabled && styles.disabled
              ]}
            >
              <Text style={[styles.text, selected && styles.textSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  label: {
    color: '#9dacbf',
    fontSize: 13,
    fontWeight: '600'
  },
  row: {
    gap: 8
  },
  chip: {
    backgroundColor: '#202939',
    borderColor: '#344159',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9
  },
  chipSelected: {
    backgroundColor: '#d6e7ff',
    borderColor: '#d6e7ff'
  },
  disabled: {
    opacity: 0.45
  },
  text: {
    color: '#c5d0df',
    fontSize: 13,
    fontWeight: '600'
  },
  textSelected: {
    color: '#142033'
  }
});
