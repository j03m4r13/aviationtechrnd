import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { extractTripDocument } from '../services/trip-document-api';
import type {
  TripDocumentExtraction,
  TripDocumentExtractionResponse
} from '../types/trip-document';
import { SectionCard } from './SectionCard';

type Props = {
  onExtracted: (extraction: TripDocumentExtraction) => void;
};

type SelectedImage = {
  uri: string;
  width: number;
  height: number;
  fileName: string | null;
  fileSize: number | null;
};

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) {
    return 'size unavailable';
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatConfidence(value: TripDocumentExtraction['confidence']): string {
  return value.toUpperCase();
}

export function TripDocumentScanner({ onExtracted }: Props) {
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [result, setResult] = useState<TripDocumentExtractionResponse | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(
    'Take a clear photo or choose an existing image. Keep the whole trip table visible.'
  );

  function acceptAsset(asset: ImagePicker.ImagePickerAsset) {
    setSelectedImage({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      fileSize: asset.fileSize ?? null
    });
    setResult(null);
    setMessage('Image selected. Review the preview, then read the document.');
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera permission required',
        'Allow camera access to photograph the trip document.'
      );
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.95
    });

    const asset = pickerResult.assets?.[0];
    if (!pickerResult.canceled && asset) {
      acceptAsset(asset);
    }
  }

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo permission required',
        'Allow photo access to select a trip-document image.'
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.95
    });

    const asset = pickerResult.assets?.[0];
    if (!pickerResult.canceled && asset) {
      acceptAsset(asset);
    }
  }

  async function readDocument() {
    if (!selectedImage || processing) {
      return;
    }

    try {
      setProcessing(true);
      setMessage('Uploading securely and reading the trip document…');
      const extractionResult = await extractTripDocument(selectedImage.uri);
      setResult(extractionResult);
      onExtracted(extractionResult.extraction);
      setMessage(
        'Extracted fields were loaded into the estimate below. Review every value before relying on it.'
      );
    } catch (error) {
      const details =
        error instanceof Error ? error.message : 'Unable to read the trip document.';
      setMessage(details);
      Alert.alert('Document reading failed', details);
    } finally {
      setProcessing(false);
    }
  }

  const extraction = result?.extraction ?? null;

  return (
    <SectionCard title="Read trip document">
      <Text style={styles.help}>
        AI extracts visible schedule facts only. The TypeScript calculator performs the
        wage estimate, and missing contract items stay flagged for review.
      </Text>

      <View style={styles.actionRow}>
        <Pressable
          disabled={processing}
          onPress={() => void takePhoto()}
          style={[styles.actionButton, processing && styles.disabled]}
        >
          <Text style={styles.actionButtonText}>Take photo</Text>
        </Pressable>
        <Pressable
          disabled={processing}
          onPress={() => void choosePhoto()}
          style={[styles.actionButton, processing && styles.disabled]}
        >
          <Text style={styles.actionButtonText}>Choose image</Text>
        </Pressable>
      </View>

      {selectedImage ? (
        <View style={styles.previewBox}>
          <Image
            resizeMode="contain"
            source={{ uri: selectedImage.uri }}
            style={styles.preview}
          />
          <Text style={styles.meta}>
            {selectedImage.fileName ?? 'Trip document'} · {selectedImage.width}×
            {selectedImage.height} · {formatBytes(selectedImage.fileSize)}
          </Text>
        </View>
      ) : null}

      <Pressable
        disabled={!selectedImage || processing}
        onPress={() => void readDocument()}
        style={[
          styles.readButton,
          (!selectedImage || processing) && styles.disabled
        ]}
      >
        {processing ? (
          <ActivityIndicator color="#142033" />
        ) : (
          <Text style={styles.readButtonText}>Read and fill estimate</Text>
        )}
      </Pressable>

      <Text style={styles.status}>{message}</Text>

      {extraction ? (
        <View style={styles.resultBox}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultTitle}>Extraction review</Text>
            <View
              style={[
                styles.confidence,
                extraction.confidence === 'green'
                  ? styles.confidenceGreen
                  : extraction.confidence === 'yellow'
                    ? styles.confidenceYellow
                    : styles.confidenceRed
              ]}
            >
              <Text style={styles.confidenceText}>
                {formatConfidence(extraction.confidence)}
              </Text>
            </View>
          </View>

          <Text style={styles.resultLine}>
            Trip: {extraction.tripId ?? 'Unreadable'}
          </Text>
          <Text style={styles.resultLine}>
            Route: {extraction.route.length > 0 ? extraction.route.join('–') : 'Unreadable'}
          </Text>
          <Text style={styles.resultLine}>
            Block: {extraction.totalBlock ?? extraction.actualBlock ?? 'Unreadable'} · Credit:{' '}
            {extraction.creditShown ?? 'Unreadable'} · TAFB: {extraction.tafb ?? 'Unreadable'}
          </Text>
          <Text style={styles.resultLine}>
            Seat: {extraction.seat} · Fleet: {extraction.fleet ?? 'Unknown'} · Base:{' '}
            {extraction.base ?? 'Unknown'}
          </Text>
          <Text style={styles.resultLine}>
            Model: {result?.model ?? 'Unknown'} · Estimated API cost:{' '}
            ${(result?.usage.estimatedCostUsd ?? 0).toFixed(4)}
          </Text>

          {extraction.unreadableFields.length > 0 ? (
            <Text style={styles.warning}>
              Needs manual entry: {extraction.unreadableFields.join(', ')}
            </Text>
          ) : null}

          {extraction.remarks.map((remark, index) => (
            <Text key={`${remark}-${index}`} style={styles.remark}>
              • {remark}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.privacy}>
        Crew names and employee identifiers are intentionally excluded from the AI
        response. The server does not save the uploaded image in this MVP flow.
      </Text>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  help: {
    color: '#9dacbf',
    fontSize: 12,
    lineHeight: 18
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#0f2030',
    borderColor: '#355579',
    borderRadius: 11,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  actionButtonText: {
    color: '#b9dcff',
    fontSize: 13,
    fontWeight: '800'
  },
  previewBox: {
    backgroundColor: '#0f141d',
    borderColor: '#354158',
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    overflow: 'hidden',
    padding: 8
  },
  preview: {
    borderRadius: 8,
    height: 230,
    width: '100%'
  },
  meta: {
    color: '#78879b',
    fontSize: 10,
    textAlign: 'center'
  },
  readButton: {
    alignItems: 'center',
    backgroundColor: '#d6e7ff',
    borderRadius: 11,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  readButtonText: {
    color: '#142033',
    fontSize: 14,
    fontWeight: '900'
  },
  disabled: {
    opacity: 0.42
  },
  status: {
    color: '#aeb9c8',
    fontSize: 12,
    lineHeight: 18
  },
  resultBox: {
    backgroundColor: '#101923',
    borderColor: '#30425b',
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    padding: 12
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  resultTitle: {
    color: '#eef5fc',
    fontSize: 14,
    fontWeight: '800'
  },
  confidence: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  confidenceGreen: {
    backgroundColor: '#1c5738'
  },
  confidenceYellow: {
    backgroundColor: '#69551a'
  },
  confidenceRed: {
    backgroundColor: '#692b34'
  },
  confidenceText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900'
  },
  resultLine: {
    color: '#c7d2df',
    fontSize: 11,
    lineHeight: 17
  },
  warning: {
    color: '#ffd27d',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 17
  },
  remark: {
    color: '#9dacbf',
    fontSize: 11,
    lineHeight: 17
  },
  privacy: {
    color: '#6f7d91',
    fontSize: 10,
    lineHeight: 16
  }
});
