export type TripDocumentRegion =
  | 'domestic'
  | 'international'
  | 'europe'
  | 'pacific-rim'
  | 'unknown';

export type TripDocumentSegment = {
  date: string | null;
  departure: string | null;
  arrival: string | null;
  blockTime: string | null;
  dutyTime: string | null;
  aircraft: string | null;
  deadhead: boolean | null;
  international: boolean | null;
};

export type TripDocumentExtraction = {
  documentType: 'trip-information' | 'unknown';
  documentDate: string | null;
  tripId: string | null;
  seat: 'captain' | 'first-officer' | 'unknown';
  fleet: string | null;
  base: string | null;
  route: string[];
  scheduledBlock: string | null;
  actualBlock: string | null;
  totalBlock: string | null;
  dutyTime: string | null;
  creditShown: string | null;
  tafb: string | null;
  tripDays: number | null;
  dutyPeriods: number | null;
  segments: TripDocumentSegment[];
  deadheads: string[];
  internationalSegments: string[];
  region: TripDocumentRegion;
  revisionStatus: 'original' | 'revised' | 'unknown';
  payPeriodCrossover: boolean | null;
  hotels: string[];
  transportIssues: string[];
  expenseIssues: string[];
  unreadableFields: string[];
  remarks: string[];
  confidence: 'green' | 'yellow' | 'red';
};

export type TripDocumentExtractionResponse = {
  extraction: TripDocumentExtraction;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    estimatedCostUsd: number;
  };
};
