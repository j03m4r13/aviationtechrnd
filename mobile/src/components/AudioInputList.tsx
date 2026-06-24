import type { RecordingInput } from 'expo-audio';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  inputs: RecordingInput[];
  selectedUid: string | null;
  currentUid: string | null;
  disabled?: boolean;
  onSelect: (input: RecordingInput) => void;
};

export function AudioInputList({
  inputs,
  selectedUid,
  currentUid,
  disabled = false,
  onSelect
}: Props) {
  if (inputs.length === 0) {
    return (
      <Text style={styles.empty}>
        No inputs have been enumerated. Pair/connect the headset and tap
        Refresh inputs.
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {inputs.map((input) => {
        const selected = input.uid === selectedUid;
        const active = input.uid === currentUid;

        return (
          <Pressable
            disabled={disabled}
            key={input.uid}
            onPress={() => onSelect(input)}
            style={[
              styles.item,
              selected && styles.itemSelected,
              disabled && styles.disabled
            ]}
          >
            <View style={styles.details}>
              <Text style={styles.name}>{input.name}</Text>
              <Text style={styles.type}>{input.type}</Text>
            </View>

            <View style={styles.badges}>
              {active ? <Text style={styles.activeBadge}>ACTIVE</Text> : null}
              {selected ? (
                <Text style={styles.selectedBadge}>SELECTED</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 9
  },
  item: {
    alignItems: 'center',
    backgroundColor: '#202939',
    borderColor: '#344159',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12
  },
  itemSelected: {
    borderColor: '#85b7ff',
    borderWidth: 2
  },
  disabled: {
    opacity: 0.5
  },
  details: {
    flex: 1,
    gap: 3
  },
  name: {
    color: '#f2f5f8',
    fontSize: 14,
    fontWeight: '700'
  },
  type: {
    color: '#9dacbf',
    fontSize: 12
  },
  badges: {
    alignItems: 'flex-end',
    gap: 4
  },
  activeBadge: {
    color: '#77e8a9',
    fontSize: 10,
    fontWeight: '800'
  },
  selectedBadge: {
    color: '#85b7ff',
    fontSize: 10,
    fontWeight: '800'
  },
  empty: {
    color: '#9dacbf',
    lineHeight: 20
  }
});
