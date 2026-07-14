import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const visionModel = process.env.OPENAI_VISION_MODEL ?? 'gpt-5.6-luna';
const visionInputCostPerMillion = Number(
  process.env.VISION_INPUT_COST_PER_MILLION_USD ?? '1.00'
);
const visionOutputCostPerMillion = Number(
  process.env.VISION_OUTPUT_COST_PER_MILLION_USD ?? '6.00'
);

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

const nullableString = { type: ['string', 'null'] } as const;
const nullableBoolean = { type: ['boolean', 'null'] } as const;
const nullableInteger = { type: ['integer', 'null'] } as const;

const tripDocumentSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'documentType',
    'documentDate',
    'tripId',
    'seat',
    'fleet',
    'base',
    'route',
    'scheduledBlock',
    'actualBlock',
    'totalBlock',
    'dutyTime',
    'creditShown',
    'tafb',
    'tripDays',
    'dutyPeriods',
    'segments',
    'deadheads',
    'internationalSegments',
    'region',
    'revisionStatus',
    'payPeriodCrossover',
    'hotels',
    'transportIssues',
    'expenseIssues',
    'unreadableFields',
    'remarks',
    'confidence'
  ],
  properties: {
    documentType: {
      type: 'string',
      enum: ['trip-information', 'unknown']
    },
    documentDate: nullableString,
    tripId: nullableString,
    seat: {
      type: 'string',
      enum: ['captain', 'first-officer', 'unknown']
    },
    fleet: nullableString,
    base: nullableString,
    route: {
      type: 'array',
      items: { type: 'string' }
    },
    scheduledBlock: nullableString,
    actualBlock: nullableString,
    totalBlock: nullableString,
    dutyTime: nullableString,
    creditShown: nullableString,
    tafb: nullableString,
    tripDays: nullableInteger,
    dutyPeriods: nullableInteger,
    segments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'date',
          'departure',
          'arrival',
          'blockTime',
          'dutyTime',
          'aircraft',
          'deadhead',
          'international'
        ],
        properties: {
          date: nullableString,
          departure: nullableString,
          arrival: nullableString,
          blockTime: nullableString,
          dutyTime: nullableString,
          aircraft: nullableString,
          deadhead: nullableBoolean,
          international: nullableBoolean
        }
      }
    },
    deadheads: {
      type: 'array',
      items: { type: 'string' }
    },
    internationalSegments: {
      type: 'array',
      items: { type: 'string' }
    },
    region: {
      type: 'string',
      enum: ['domestic', 'international', 'europe', 'pacific-rim', 'unknown']
    },
    revisionStatus: {
      type: 'string',
      enum: ['original', 'revised', 'unknown']
    },
    payPeriodCrossover: nullableBoolean,
    hotels: {
      type: 'array',
      items: { type: 'string' }
    },
    transportIssues: {
      type: 'array',
      items: { type: 'string' }
    },
    expenseIssues: {
      type: 'array',
      items: { type: 'string' }
    },
    unreadableFields: {
      type: 'array',
      items: { type: 'string' }
    },
    remarks: {
      type: 'array',
      items: { type: 'string' }
    },
    confidence: {
      type: 'string',
      enum: ['green', 'yellow', 'red']
    }
  }
} as const;

type ExtractTripDocumentArguments = {
  image: Buffer;
  mimeType: string;
};

function requireTimeFormat(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^\d{1,3}:[0-5]\d$/.test(value));
}

function validateExtraction(value: unknown): TripDocumentExtraction {
  if (!value || typeof value !== 'object') {
    throw new Error('The vision model returned an invalid trip-document result.');
  }

  const extraction = value as TripDocumentExtraction;
  const timeFields = [
    extraction.scheduledBlock,
    extraction.actualBlock,
    extraction.totalBlock,
    extraction.dutyTime,
    extraction.creditShown,
    extraction.tafb
  ];

  if (!timeFields.every(requireTimeFormat)) {
    throw new Error('The vision model returned an invalid H:MM time value.');
  }

  if (!Array.isArray(extraction.route) || !Array.isArray(extraction.segments)) {
    throw new Error('The vision model returned an incomplete trip-document result.');
  }

  return extraction;
}

export async function extractTripDocument({
  image,
  mimeType
}: ExtractTripDocumentArguments) {
  const dataUrl = `data:${mimeType};base64,${image.toString('base64')}`;

  const response = await client.responses.create({
    model: visionModel,
    store: false,
    reasoning: { effort: 'low' },
    instructions: [
      'You extract operational trip information from airline crew trip documents for an estimate worksheet.',
      'Read only information visible in the supplied image. Never invent a number, date, airport, credit, pay code, or contract rule.',
      'Do not calculate wages, guarantees, rigs, premiums, per diem, or reimbursements.',
      'Return all time values in H:MM format. Use null when a value is absent or unreadable.',
      'Use totalBlock for a document-level Block Time total. Use actualBlock only when the document explicitly identifies actual or flown block. Use scheduledBlock only when explicitly identified as scheduled.',
      'Build route from visible flight segments in chronological order.',
      'Classify region as domestic, international, europe, or pacific-rim when reasonably supported by the route; otherwise use unknown and explain the uncertainty in remarks.',
      'Do not return crew names, employee numbers, crew IDs, phone numbers, or other personal identifiers. They are not part of the schema.',
      'Mark confidence yellow when important fields require pilot review and red when the document is not a readable trip document.'
    ].join(' '),
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Extract this trip document into the required structured fields. Preserve airport codes and trip identifiers exactly.'
          },
          {
            type: 'input_image',
            image_url: dataUrl,
            detail: 'original'
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'trip_document_extraction',
        strict: true,
        schema: tripDocumentSchema
      }
    }
  });

  const output = response.output_text.trim();
  if (!output) {
    throw new Error('The vision model returned an empty trip-document result.');
  }

  const extraction = validateExtraction(JSON.parse(output));
  const inputTokens = response.usage?.input_tokens ?? null;
  const outputTokens = response.usage?.output_tokens ?? null;
  const estimatedCostUsd =
    ((inputTokens ?? 0) / 1_000_000) * visionInputCostPerMillion +
    ((outputTokens ?? 0) / 1_000_000) * visionOutputCostPerMillion;

  return {
    extraction,
    model: visionModel,
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(6))
    }
  };
}
