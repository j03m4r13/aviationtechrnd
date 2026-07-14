import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { extractTripDocument } from '../services/trip-document-api';
import type {
  TripDocumentExtraction,
  TripDocumentExtractionResponse,
  TripDocumentSegment
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

type DataRowProps = {
  label: string;
  value: string;
  last?: boolean;
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

function formatBoolean(value: boolean | null): string {
  if (value === null) {
    return 'Unknown';
  }
  return value ? 'Yes' : 'No';
}

function formatValue(value: string | number | null): string {
  if (value === null || value === '') {
    return 'Not recognized';
  }
  return String(value);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'None recognized';
}

function formatSeat(value: TripDocumentExtraction['seat']): string {
  if (value === 'first-officer') {
    return 'First Officer';
  }
  if (value === 'captain') {
    return 'Captain';
  }
  return 'Unknown';
}

function formatRegion(value: TripDocumentExtraction['region']): string {
  if (value === 'pacific-rim') {
    return 'Pacific Rim';
  }
  if (value === 'international') {
    return 'International';
  }
  if (value === 'europe') {
    return 'Europe';
  }
  if (value === 'domestic') {
    return 'Domestic';
  }
  return 'Unknown';
}

function formatRevision(value: TripDocumentExtraction['revisionStatus']): string {
  if (value === 'revised') {
    return 'Revised';
  }
  if (value === 'original') {
    return 'Original';
  }
  return 'Unknown';
}

function DataRow({ label, value, last = false }: DataRowProps) {
  return (
    <View style={[styles.dataRow, last && styles.dataRowLast]}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text selectable style={styles.dataValue}>
        {value}
      </Text>
    </View>
  );
}

function SegmentCell({
  children,
  width,
  header = false
}: {
  children: string;
  width: number;
  header?: boolean;
}) {
  return (
    <View style={[styles.segmentCell, { width }, header && styles.segmentHeaderCell]}>
      <Text
        numberOfLines={header ? 1 : 2}
        selectable={!header}
        style={[styles.segmentCellText, header && styles.segmentHeaderText]}
      >
        {children}
      </Text>
    </View>
  );
}

function SegmentRow({ segment }: { segment: TripDocumentSegment }) {
  return (
    <View style={styles.segmentRow}>
      <SegmentCell width={96}>{formatValue(segment.date)}</SegmentCell>
      <SegmentCell width={64}>{formatValue(segment.departure)}</SegmentCell>
      <SegmentCell width={64}>{formatValue(segment.arrival)}</SegmentCell>
      <SegmentCell width={72}>{formatValue(segment.blockTime)}</SegmentCell>
      <SegmentCell width={72}>{formatValue(segment.dutyTime)}</SegmentCell>
      <SegmentCell width={82}>{formatValue(segment.aircraft)}</SegmentCell>
      <SegmentCell width={58}>{formatBoolean(segment.deadhead)}</SegmentCell>
      <SegmentCell width={58}>{formatBoolean(segment.international)}</SegmentCell>
    </View>
  );
}

export function TripDocumentScanner({ onExtracted }: Props) {
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [result, setResult] = useState<TripDocumentExtractionResponse | null>(null);
  const [processing, setProcessing] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
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
    setReviewExpanded(false);
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
      setReviewExpanded(true);
      onExtracted(extractionResult.extraction);
      setMessage(
        'Recognized data is shown below and was loaded into the estimate. Review every value before relying on it.'
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
  const recognizedRows: DataRowProps[] = extraction
    ? [
        { label: 'Document type', value: formatValue(extraction.documentType) },
        { label: 'Document date', value: formatValue(extraction.documentDate) },
        { label: 'Trip / pair ID', value: formatValue(extraction.tripId) },
        { label: 'Seat', value: formatSeat(extraction.seat) },
        { label: 'Fleet', value: formatValue(extraction.fleet) },
        { label: 'Base / domicile', value: formatValue(extraction.base) },
        {
          label: 'Route',
          value:
            extraction.route.length > 0
              ? extraction.route.join('–')
              : 'Not recognized'
        },
        { label: 'Region', value: formatRegion(extraction.region) },
        { label: 'Revision status', value: formatRevision(extraction.revisionStatus) },
        {
          label: 'Pay-period crossover',
          value: formatBoolean(extraction.payPeriodCrossover)
        },
        { label: 'Trip days', value: formatValue(extraction.tripDays) },
        { label: 'Duty periods', value: formatValue(extraction.dutyPeriods) },
        { label: 'Scheduled block', value: formatValue(extraction.scheduledBlock) },
        { label: 'Actual / flown block', value: formatValue(extraction.actualBlock) },
        { label: 'Total block shown', value: formatValue(extraction.totalBlock) },
        { label: 'Total duty shown', value: formatValue(extraction.dutyTime) },
        { label: 'Credit shown', value: formatValue(extraction.creditShown) },
        { label: 'TAFB', value: formatValue(extraction.tafb) },
        { label: 'Deadheads', value: formatList(extraction.deadheads) },
        {
          label: 'International segments',
          value: formatList(extraction.internationalSegments)
        },
        { label: 'Hotels', value: formatList(extraction.hotels) },
        { label: 'Transport issues', value: formatList(extraction.transportIssues) },
        { label: 'Expense issues', value: formatList(extraction.expenseIssues) }
      ]
    : [];

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
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: reviewExpanded }}
            onPress={() => setReviewExpanded((current) => !current)}
            style={styles.resultToggle}
          >
            <View style={styles.resultHeader}>
              <View style={styles.resultHeadingWrap}>
                <Text style={styles.resultTitle}>Recognized trip data</Text>
                <Text style={styles.resultSubtitle}>
                  {reviewExpanded ? 'Tap to collapse the table' : 'Tap to view the full table'}
                </Text>
              </View>
              <View style={styles.headerActions}>
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
                <Text style={styles.expandIcon}>{reviewExpanded ? '▲' : '▼'}</Text>
              </View>
            </View>
          </Pressable>

          <View style={styles.compactSummary}>
            <Text style={styles.compactSummaryText}>
              {extraction.tripId ?? 'Unknown trip'} ·{' '}
              {extraction.route.length > 0
                ? extraction.route.join('–')
                : 'Route not recognized'}
            </Text>
            <Text style={styles.compactSummaryMeta}>
              Block {extraction.totalBlock ?? extraction.actualBlock ?? '—'} · Credit{' '}
              {extraction.creditShown ?? '—'} · TAFB {extraction.tafb ?? '—'}
            </Text>
          </View>

          {reviewExpanded ? (
            <>
              <View style={styles.dataTable}>
                <View style={styles.dataHeaderRow}>
                  <Text style={styles.dataHeaderLabel}>FIELD</Text>
                  <Text style={styles.dataHeaderValue}>RECOGNIZED VALUE</Text>
                </View>
                {recognizedRows.map((row, index) => (
                  <DataRow
                    key={row.label}
                    label={row.label}
                    last={index === recognizedRows.length - 1}
                    value={row.value}
                  />
                ))}
              </View>

              <View style={styles.sectionHeadingRow}>
                <Text style={styles.sectionHeading}>RECOGNIZED FLIGHT SEGMENTS</Text>
                <Text style={styles.sectionCount}>{extraction.segments.length}</Text>
              </View>

              {extraction.segments.length > 0 ? (
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator
                  style={styles.segmentScroller}
                >
                  <View style={styles.segmentTable}>
                    <View style={[styles.segmentRow, styles.segmentHeaderRow]}>
                      <SegmentCell header width={96}>Date</SegmentCell>
                      <SegmentCell header width={64}>From</SegmentCell>
                      <SegmentCell header width={64}>To</SegmentCell>
                      <SegmentCell header width={72}>Block</SegmentCell>
                      <SegmentCell header width={72}>Duty</SegmentCell>
                      <SegmentCell header width={82}>Aircraft</SegmentCell>
                      <SegmentCell header width={58}>DH</SegmentCell>
                      <SegmentCell header width={58}>Intl</SegmentCell>
                    </View>
                    {extraction.segments.map((segment, index) => (
                      <SegmentRow
                        key={`${segment.date ?? 'date'}-${segment.departure ?? 'from'}-${segment.arrival ?? 'to'}-${index}`}
                        segment={segment}
                      />
                    ))}
                  </View>
                </ScrollView>
              ) : (
                <Text style={styles.emptySegments}>
                  No individual flight segments were recognized. Enter them manually if
                  they are needed for contract review.
                </Text>
              )}

              <View style={styles.apiMetaBox}>
                <Text style={styles.apiMetaText}>
                  Model: {result?.model ?? 'Unknown'}
                </Text>
                <Text style={styles.apiMetaText}>
                  Input tokens: {result?.usage.inputTokens ?? 'Unavailable'} · Output tokens:{' '}
                  {result?.usage.outputTokens ?? 'Unavailable'}
                </Text>
                <Text style={styles.apiMetaText}>
                  Estimated API cost: ${(result?.usage.estimatedCostUsd ?? 0).toFixed(4)}
                </Text>
              </View>

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
            </>
          ) : null}
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
    overflow: 'hidden'
  },
  resultToggle: {
    padding: 12
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  resultHeadingWrap: {
    flex: 1,
    gap: 2
  },
  resultTitle: {
    color: '#eef5fc',
    fontSize: 14,
    fontWeight: '800'
  },
  resultSubtitle: {
    color: '#8190a3',
    fontSize: 10
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9
  },
  expandIcon: {
    color: '#8ec5ff',
    fontSize: 12,
    fontWeight: '900'
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
  compactSummary: {
    backgroundColor: '#0d151f',
    borderTopColor: '#28384d',
    borderTopWidth: 1,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  compactSummaryText: {
    color: '#dce7f3',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 17
  },
  compactSummaryMeta: {
    color: '#8d9bad',
    fontSize: 10,
    lineHeight: 15
  },
  dataTable: {
    borderColor: '#30425b',
    borderRadius: 9,
    borderWidth: 1,
    marginHorizontal: 12,
    marginTop: 12,
    overflow: 'hidden'
  },
  dataHeaderRow: {
    backgroundColor: '#1a2a3b',
    flexDirection: 'row',
    minHeight: 34
  },
  dataHeaderLabel: {
    color: '#8ec5ff',
    flex: 0.42,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    paddingHorizontal: 9,
    paddingVertical: 10
  },
  dataHeaderValue: {
    borderLeftColor: '#30425b',
    borderLeftWidth: 1,
    color: '#8ec5ff',
    flex: 0.58,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    paddingHorizontal: 9,
    paddingVertical: 10
  },
  dataRow: {
    backgroundColor: '#101923',
    borderBottomColor: '#293a4f',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 39
  },
  dataRowLast: {
    borderBottomWidth: 0
  },
  dataLabel: {
    color: '#94a4b8',
    flex: 0.42,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
    paddingHorizontal: 9,
    paddingVertical: 10
  },
  dataValue: {
    borderLeftColor: '#293a4f',
    borderLeftWidth: 1,
    color: '#e1e9f2',
    flex: 0.58,
    fontSize: 10,
    lineHeight: 15,
    paddingHorizontal: 9,
    paddingVertical: 10
  },
  sectionHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 15
  },
  sectionHeading: {
    color: '#8ec5ff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  sectionCount: {
    backgroundColor: '#24384f',
    borderRadius: 999,
    color: '#cfe6ff',
    fontSize: 9,
    fontWeight: '800',
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: 'center'
  },
  segmentScroller: {
    marginBottom: 2,
    marginHorizontal: 12,
    marginTop: 8
  },
  segmentTable: {
    borderColor: '#30425b',
    borderRadius: 9,
    borderWidth: 1,
    overflow: 'hidden'
  },
  segmentRow: {
    backgroundColor: '#101923',
    borderBottomColor: '#293a4f',
    borderBottomWidth: 1,
    flexDirection: 'row'
  },
  segmentHeaderRow: {
    backgroundColor: '#1a2a3b'
  },
  segmentCell: {
    borderRightColor: '#293a4f',
    borderRightWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 7,
    paddingVertical: 7
  },
  segmentHeaderCell: {
    minHeight: 34,
    paddingVertical: 8
  },
  segmentCellText: {
    color: '#dbe5ef',
    fontSize: 9,
    lineHeight: 13
  },
  segmentHeaderText: {
    color: '#8ec5ff',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  emptySegments: {
    color: '#8f9eb1',
    fontSize: 10,
    lineHeight: 16,
    marginHorizontal: 12,
    marginTop: 8
  },
  apiMetaBox: {
    backgroundColor: '#0d151f',
    borderColor: '#27384d',
    borderRadius: 9,
    borderWidth: 1,
    gap: 3,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 10
  },
  apiMetaText: {
    color: '#77879a',
    fontSize: 9,
    lineHeight: 14
  },
  warning: {
    color: '#ffd27d',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 17,
    marginHorizontal: 12,
    marginTop: 10
  },
  remark: {
    color: '#9dacbf',
    fontSize: 11,
    lineHeight: 17,
    marginHorizontal: 12,
    marginTop: 5
  },
  privacy: {
    color: '#6f7d91',
    fontSize: 10,
    lineHeight: 16
  }
});