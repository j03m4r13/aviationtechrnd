import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { SectionCard } from './SectionCard';

type Seat = 'captain' | 'first-officer';
type PayPeriod = '28' | '35';
type PerDiemCategory =
  | 'domestic'
  | 'international'
  | 'europe'
  | 'pacific-rim';
type Confidence = 'GREEN' | 'YELLOW' | 'RED';

type Choice<T extends string> = {
  label: string;
  value: T;
};

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  note?: string;
};

type CreditCandidate = {
  label: string;
  minutes: number;
};

const CAPTAIN_RATE = '401.01';
const FIRST_OFFICER_RATE = '228.00';
const INTERNATIONAL_PREMIUM_RATE = '6.50';

const SEAT_CHOICES: Choice<Seat>[] = [
  { label: 'Captain', value: 'captain' },
  { label: 'First Officer', value: 'first-officer' }
];

const PAY_PERIOD_CHOICES: Choice<PayPeriod>[] = [
  { label: '28 days · 75:00', value: '28' },
  { label: '35 days · 96:00', value: '35' }
];

const PER_DIEM_CHOICES: Choice<PerDiemCategory>[] = [
  { label: 'Domestic', value: 'domestic' },
  { label: 'International', value: 'international' },
  { label: 'Europe', value: 'europe' },
  { label: 'Pacific Rim', value: 'pacific-rim' }
];

function parseTime(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const hoursText = match[1];
  const minutesText = match[2] ?? '0';

  if (!hoursText) {
    return null;
  }

  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function parseMoney(value: string): number | null {
  const trimmed = value.replace(/[$,\s]/g, '');

  if (!trimmed) {
    return null;
  }

  const amount = Number(trimmed);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) {
    return '—';
  }

  const rounded = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${hours}:${remainder.toString().padStart(2, '0')}`;
}

function formatCurrency(amount: number | null): string {
  if (amount === null) {
    return 'Pending';
  }

  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCategory(category: PerDiemCategory): string {
  switch (category) {
    case 'pacific-rim':
      return 'Pacific Rim';
    case 'international':
      return 'International';
    case 'europe':
      return 'Europe';
    default:
      return 'Domestic';
  }
}

function isInvalidTime(value: string, parsed: number | null): boolean {
  return value.trim().length > 0 && parsed === null;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  note
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#65748a"
        style={styles.input}
        value={value}
      />
      {note ? <Text style={styles.fieldNote}>{note}</Text> : null}
    </View>
  );
}

function SegmentedChoice<T extends string>({
  choices,
  value,
  onChange
}: {
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      {choices.map((choice) => {
        const active = choice.value === value;

        return (
          <Pressable
            key={choice.value}
            onPress={() => onChange(choice.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ResultRow({
  label,
  value,
  emphasized = false
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={[styles.resultRow, emphasized && styles.resultRowEmphasized]}>
      <Text style={[styles.resultLabel, emphasized && styles.resultLabelStrong]}>
        {label}
      </Text>
      <Text style={[styles.resultValue, emphasized && styles.resultValueStrong]}>
        {value}
      </Text>
    </View>
  );
}

export function PilotPayCalculatorScreen() {
  const [seat, setSeat] = useState<Seat>('captain');
  const [hourlyRate, setHourlyRate] = useState(CAPTAIN_RATE);
  const [payPeriod, setPayPeriod] = useState<PayPeriod>('28');

  const [tripId, setTripId] = useState('');
  const [route, setRoute] = useState('');
  const [scheduledBlock, setScheduledBlock] = useState('');
  const [actualBlock, setActualBlock] = useState('');
  const [dutyRigCredit, setDutyRigCredit] = useState('');
  const [mpdpCredit, setMpdpCredit] = useState('');
  const [tafb, setTafb] = useState('');
  const [turnMinimumCredit, setTurnMinimumCredit] = useState('');
  const [creditShown, setCreditShown] = useState('');
  const [originalTripCredit, setOriginalTripCredit] = useState('');
  const [revisedTripCredit, setRevisedTripCredit] = useState('');
  const [otherPayPeriodCredit, setOtherPayPeriodCredit] = useState('');

  const [perDiemCategory, setPerDiemCategory] =
    useState<PerDiemCategory>('domestic');
  const [perDiemHourlyRate, setPerDiemHourlyRate] = useState('');
  const [actualPerDiem, setActualPerDiem] = useState('');

  const [applyInternationalPremium, setApplyInternationalPremium] =
    useState(false);
  const [internationalPremiumRate, setInternationalPremiumRate] = useState(
    INTERNATIONAL_PREMIUM_RATE
  );
  const [internationalEligibleCredit, setInternationalEligibleCredit] =
    useState('');
  const [otherWagePremium, setOtherWagePremium] = useState('');
  const [reimbursements, setReimbursements] = useState('');

  const estimate = useMemo(() => {
    const scheduledMinutes = parseTime(scheduledBlock);
    const actualMinutes = parseTime(actualBlock);
    const dutyRigMinutes = parseTime(dutyRigCredit);
    const mpdpMinutes = parseTime(mpdpCredit);
    const tafbMinutes = parseTime(tafb);
    const turnMinutes = parseTime(turnMinimumCredit);
    const shownMinutes = parseTime(creditShown);
    const originalMinutes = parseTime(originalTripCredit);
    const revisedMinutes = parseTime(revisedTripCredit);
    const otherCreditMinutes = parseTime(otherPayPeriodCredit) ?? 0;
    const eligibleInternationalMinutes = parseTime(internationalEligibleCredit);

    const rate = parseMoney(hourlyRate);
    const premiumRate = parseMoney(internationalPremiumRate);
    const perDiemRate = parseMoney(perDiemHourlyRate);
    const reportedPerDiem = parseMoney(actualPerDiem);
    const otherPremiumAmount = parseMoney(otherWagePremium) ?? 0;
    const reimbursementAmount = parseMoney(reimbursements) ?? 0;

    const dutyCandidates: CreditCandidate[] = [];

    if (actualMinutes !== null) {
      dutyCandidates.push({ label: 'Actual block', minutes: actualMinutes });
    }
    if (scheduledMinutes !== null) {
      dutyCandidates.push({ label: 'Scheduled block', minutes: scheduledMinutes });
    }
    if (dutyRigMinutes !== null) {
      dutyCandidates.push({ label: 'Duty rig', minutes: dutyRigMinutes });
    }
    if (mpdpMinutes !== null) {
      dutyCandidates.push({ label: 'MPDP', minutes: mpdpMinutes });
    }

    const dutyPeriodCredit =
      dutyCandidates.length > 0
        ? Math.max(...dutyCandidates.map((candidate) => candidate.minutes))
        : null;

    const tripRigMinutes =
      tafbMinutes === null ? null : Math.floor(tafbMinutes / 3.75);

    const revisionProtectedMinutes =
      originalMinutes === null && revisedMinutes === null
        ? null
        : Math.max(originalMinutes ?? 0, revisedMinutes ?? 0);

    const candidates: CreditCandidate[] = [];

    if (shownMinutes !== null) {
      candidates.push({ label: 'Credit shown', minutes: shownMinutes });
    }
    if (dutyPeriodCredit !== null) {
      candidates.push({ label: 'Duty-period greater-of', minutes: dutyPeriodCredit });
    }
    if (tripRigMinutes !== null) {
      candidates.push({ label: 'TAFB trip rig', minutes: tripRigMinutes });
    }
    if (turnMinutes !== null) {
      candidates.push({ label: 'Turn minimum', minutes: turnMinutes });
    }
    if (revisionProtectedMinutes !== null) {
      candidates.push({
        label: 'Original/revised protection',
        minutes: revisionProtectedMinutes
      });
    }

    const tripCreditMinutes =
      candidates.length > 0
        ? Math.max(...candidates.map((candidate) => candidate.minutes))
        : null;

    const winningRules =
      tripCreditMinutes === null
        ? []
        : candidates
            .filter((candidate) => candidate.minutes === tripCreditMinutes)
            .map((candidate) => candidate.label);

    const guaranteeMinutes = payPeriod === '28' ? 75 * 60 : 96 * 60;
    const capMinutes = payPeriod === '28' ? 104 * 60 : 130 * 60;
    const enteredPayPeriodMinutes =
      tripCreditMinutes === null ? null : tripCreditMinutes + otherCreditMinutes;
    const paidCreditMinutes =
      enteredPayPeriodMinutes === null
        ? null
        : Math.max(guaranteeMinutes, enteredPayPeriodMinutes);

    const tripBaseWage =
      tripCreditMinutes === null || rate === null
        ? null
        : (tripCreditMinutes / 60) * rate;
    const payPeriodBaseWage =
      paidCreditMinutes === null || rate === null
        ? null
        : (paidCreditMinutes / 60) * rate;

    const isInternational = perDiemCategory !== 'domestic';
    const assumedInternationalMinutes =
      applyInternationalPremium && isInternational
        ? (eligibleInternationalMinutes ?? tripCreditMinutes)
        : 0;
    const internationalPremiumAmount =
      assumedInternationalMinutes === null || premiumRate === null
        ? null
        : (assumedInternationalMinutes / 60) * premiumRate;

    const estimatedPerDiem =
      reportedPerDiem !== null
        ? reportedPerDiem
        : tafbMinutes !== null && perDiemRate !== null
          ? (tafbMinutes / 60) * perDiemRate
          : null;

    const grossWage =
      payPeriodBaseWage === null || internationalPremiumAmount === null
        ? null
        : payPeriodBaseWage + internationalPremiumAmount + otherPremiumAmount;

    const knownExpectedValue =
      grossWage === null
        ? null
        : grossWage + (estimatedPerDiem ?? 0) + reimbursementAmount;

    let confidence: Confidence = 'YELLOW';

    if (tripCreditMinutes === null || rate === null) {
      confidence = 'RED';
    } else {
      const strongCreditSource =
        shownMinutes !== null ||
        dutyRigMinutes !== null ||
        mpdpMinutes !== null ||
        revisionProtectedMinutes !== null;
      const perDiemAvailable = estimatedPerDiem !== null;
      const internationalCreditKnown =
        !applyInternationalPremium ||
        !isInternational ||
        eligibleInternationalMinutes !== null;

      confidence =
        strongCreditSource && perDiemAvailable && internationalCreditKnown
          ? 'GREEN'
          : 'YELLOW';
    }

    const remarks: string[] = [];

    const timeInputs = [
      ['Scheduled block', scheduledBlock, scheduledMinutes],
      ['Actual block', actualBlock, actualMinutes],
      ['Duty rig', dutyRigCredit, dutyRigMinutes],
      ['MPDP', mpdpCredit, mpdpMinutes],
      ['TAFB', tafb, tafbMinutes],
      ['Turn minimum', turnMinimumCredit, turnMinutes],
      ['Credit shown', creditShown, shownMinutes],
      ['Original trip credit', originalTripCredit, originalMinutes],
      ['Revised trip credit', revisedTripCredit, revisedMinutes],
      ['Other pay-period credit', otherPayPeriodCredit, parseTime(otherPayPeriodCredit)],
      [
        'International eligible credit',
        internationalEligibleCredit,
        eligibleInternationalMinutes
      ]
    ] as const;

    for (const [label, value, parsed] of timeInputs) {
      if (isInvalidTime(value, parsed)) {
        remarks.push(`${label} must use H:MM format, for example 38:07.`);
      }
    }

    if (shownMinutes !== null && tripRigMinutes !== null) {
      const difference = shownMinutes - tripRigMinutes;
      remarks.push(
        difference === 0
          ? `Credit shown matches the TAFB trip rig at ${formatMinutes(shownMinutes)}.`
          : `Credit shown differs from the TAFB trip rig by ${formatMinutes(
              Math.abs(difference)
            )}. Review the source report and contract factors.`
      );
    } else if (shownMinutes === null) {
      remarks.push(
        'No source credit was entered. The estimate uses only the available contractual factors.'
      );
    }

    if (dutyRigMinutes === null) {
      remarks.push('Duty rig was not evaluated because no duty-rig credit was provided.');
    }
    if (mpdpMinutes === null) {
      remarks.push('MPDP was not evaluated because no MPDP credit was provided.');
    }
    if (turnMinutes === null) {
      remarks.push('Turn-minimum rules were not evaluated.');
    }

    if ((originalMinutes === null) !== (revisedMinutes === null)) {
      remarks.push(
        'Only one side of the original-versus-revised comparison was entered; revision protection may be incomplete.'
      );
    } else if (originalMinutes === null && revisedMinutes === null) {
      remarks.push('No original/revised trip protection was evaluated.');
    }

    if (reportedPerDiem !== null) {
      remarks.push('Actual per diem report amount is used instead of a TAFB estimate.');
    } else if (estimatedPerDiem !== null) {
      remarks.push(
        `${formatCategory(
          perDiemCategory
        )} per diem is an estimate only: TAFB multiplied by the entered hourly rate.`
      );
    } else {
      remarks.push(
        'Per diem is pending. Enter either an actual per diem report amount or a category rate with TAFB.'
      );
    }

    if (isInternational && !applyInternationalPremium) {
      remarks.push(
        'International flying is selected, but international premium is not applied. Confirm eligibility and the correct seat-specific rate.'
      );
    } else if (
      isInternational &&
      applyInternationalPremium &&
      eligibleInternationalMinutes === null
    ) {
      remarks.push(
        'International premium assumes all estimated trip credit is eligible because no eligible-credit value was entered.'
      );
    }

    if (
      enteredPayPeriodMinutes !== null &&
      enteredPayPeriodMinutes < guaranteeMinutes
    ) {
      remarks.push(
        `${formatMinutes(guaranteeMinutes)} pay-period guarantee is currently controlling the wage estimate.`
      );
    } else if (enteredPayPeriodMinutes !== null) {
      remarks.push('Entered credited time is above the pay-period guarantee.');
    }

    if (paidCreditMinutes !== null && paidCreditMinutes > capMinutes) {
      remarks.push(
        `Estimated paid credit exceeds the ${formatMinutes(
          capMinutes
        )} compliance-review threshold. The app warns but does not automatically cap pay.`
      );
    }

    remarks.push(
      'Missing trips or pay codes can understate above-guarantee pay. Taxes and payroll deductions are not included.'
    );
    remarks.push(
      'Reimbursements remain separate from wage pay and are included only in total expected value.'
    );

    return {
      scheduledMinutes,
      actualMinutes,
      dutyPeriodCredit,
      tripRigMinutes,
      revisionProtectedMinutes,
      tripCreditMinutes,
      winningRules,
      guaranteeMinutes,
      capMinutes,
      enteredPayPeriodMinutes,
      paidCreditMinutes,
      tripBaseWage,
      payPeriodBaseWage,
      assumedInternationalMinutes,
      internationalPremiumAmount,
      estimatedPerDiem,
      perDiemIsReported: reportedPerDiem !== null,
      otherPremiumAmount,
      reimbursementAmount,
      grossWage,
      knownExpectedValue,
      confidence,
      remarks
    };
  }, [
    actualBlock,
    actualPerDiem,
    applyInternationalPremium,
    creditShown,
    dutyRigCredit,
    hourlyRate,
    internationalEligibleCredit,
    internationalPremiumRate,
    mpdpCredit,
    originalTripCredit,
    otherPayPeriodCredit,
    otherWagePremium,
    payPeriod,
    perDiemCategory,
    perDiemHourlyRate,
    reimbursements,
    revisedTripCredit,
    scheduledBlock,
    tafb,
    turnMinimumCredit
  ]);

  function changeSeat(nextSeat: Seat) {
    setSeat(nextSeat);
    setHourlyRate(
      nextSeat === 'captain' ? CAPTAIN_RATE : FIRST_OFFICER_RATE
    );
  }

  function loadSampleTrip() {
    setSeat('first-officer');
    setHourlyRate(FIRST_OFFICER_RATE);
    setPayPeriod('28');
    setTripId('A70248R');
    setRoute('ANC–SDF–NRT–PVG–ANC');
    setScheduledBlock('');
    setActualBlock('31:16');
    setDutyRigCredit('');
    setMpdpCredit('');
    setTafb('142:58');
    setTurnMinimumCredit('');
    setCreditShown('38:07');
    setOriginalTripCredit('');
    setRevisedTripCredit('');
    setOtherPayPeriodCredit('');
    setPerDiemCategory('pacific-rim');
    setPerDiemHourlyRate('');
    setActualPerDiem('');
    setApplyInternationalPremium(false);
    setInternationalEligibleCredit('');
    setInternationalPremiumRate(INTERNATIONAL_PREMIUM_RATE);
    setOtherWagePremium('');
    setReimbursements('');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>UPS–IPA · ESTIMATE WORKSHEET</Text>
          <Text style={styles.title}>Pilot Pay Estimate</Text>
          <Text style={styles.subtitle}>
            Calculates the best estimate available from entered schedule details.
            Missing contract factors remain visible as remarks instead of being
            silently guessed.
          </Text>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>ESTIMATE ONLY</Text>
            <Text style={styles.noticeText}>
              This is not an official payroll statement or a final contract audit.
            </Text>
          </View>
        </View>

        <SectionCard
          title="Pilot and pay period"
          right={
            <Pressable onPress={loadSampleTrip}>
              <Text style={styles.link}>Load sample trip</Text>
            </Pressable>
          }
        >
          <Text style={styles.groupLabel}>SEAT</Text>
          <SegmentedChoice
            choices={SEAT_CHOICES}
            onChange={changeSeat}
            value={seat}
          />

          <FormField
            keyboardType="decimal-pad"
            label="Hourly pay rate"
            note="Editable because contract year, seat, fleet, and longevity may change it."
            onChangeText={setHourlyRate}
            placeholder="401.01"
            value={hourlyRate}
          />

          <Text style={styles.groupLabel}>PAY PERIOD</Text>
          <SegmentedChoice
            choices={PAY_PERIOD_CHOICES}
            onChange={setPayPeriod}
            value={payPeriod}
          />
        </SectionCard>

        <SectionCard title="Trip information">
          <FormField
            label="Trip / pair ID"
            onChangeText={setTripId}
            placeholder="A70248R"
            value={tripId}
          />
          <FormField
            label="Route"
            onChangeText={setRoute}
            placeholder="ANC–SDF–NRT–PVG–ANC"
            value={route}
          />
          <FormField
            keyboardType="numeric"
            label="TAFB"
            note="Used for trip rig: TAFB ÷ 3.75. Enter H:MM."
            onChangeText={setTafb}
            placeholder="142:58"
            value={tafb}
          />
        </SectionCard>

        <SectionCard title="Available credit factors">
          <Text style={styles.help}>
            Enter only the figures shown or reliably known. The calculator uses the
            greatest available factor and explains what controlled the result.
          </Text>
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Scheduled block"
                onChangeText={setScheduledBlock}
                placeholder="H:MM"
                value={scheduledBlock}
              />
            </View>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Actual block"
                onChangeText={setActualBlock}
                placeholder="H:MM"
                value={actualBlock}
              />
            </View>
          </View>
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Duty rig credit"
                onChangeText={setDutyRigCredit}
                placeholder="H:MM"
                value={dutyRigCredit}
              />
            </View>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="MPDP credit"
                onChangeText={setMpdpCredit}
                placeholder="H:MM"
                value={mpdpCredit}
              />
            </View>
          </View>
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Turn minimum"
                onChangeText={setTurnMinimumCredit}
                placeholder="H:MM"
                value={turnMinimumCredit}
              />
            </View>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Credit shown"
                onChangeText={setCreditShown}
                placeholder="H:MM"
                value={creditShown}
              />
            </View>
          </View>
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Original trip credit"
                onChangeText={setOriginalTripCredit}
                placeholder="H:MM"
                value={originalTripCredit}
              />
            </View>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Revised/flown credit"
                onChangeText={setRevisedTripCredit}
                placeholder="H:MM"
                value={revisedTripCredit}
              />
            </View>
          </View>
          <FormField
            keyboardType="numeric"
            label="Other pay-period credit"
            note="Vacation, DTO/PTO, training, standby, open time, other trips, or other known credit."
            onChangeText={setOtherPayPeriodCredit}
            placeholder="H:MM"
            value={otherPayPeriodCredit}
          />
        </SectionCard>

        <SectionCard title="International premium">
          <Text style={styles.groupLabel}>APPLY INTERNATIONAL PREMIUM?</Text>
          <SegmentedChoice
            choices={[
              { label: 'No / unknown', value: 'no' },
              { label: 'Yes', value: 'yes' }
            ]}
            onChange={(value) => setApplyInternationalPremium(value === 'yes')}
            value={applyInternationalPremium ? 'yes' : 'no'}
          />
          <View style={styles.twoColumnRow}>
            <View style={styles.column}>
              <FormField
                keyboardType="decimal-pad"
                label="Premium rate / hr"
                onChangeText={setInternationalPremiumRate}
                placeholder="6.50"
                value={internationalPremiumRate}
              />
            </View>
            <View style={styles.column}>
              <FormField
                keyboardType="numeric"
                label="Eligible credit"
                note="Blank uses trip credit and creates a warning."
                onChangeText={setInternationalEligibleCredit}
                placeholder="H:MM"
                value={internationalEligibleCredit}
              />
            </View>
          </View>
          <FormField
            keyboardType="decimal-pad"
            label="Other wage premiums"
            note="Direct dollar estimate for junior manning or another premium not yet calculated by rule."
            onChangeText={setOtherWagePremium}
            placeholder="0.00"
            value={otherWagePremium}
          />
        </SectionCard>

        <SectionCard title="Per diem and reimbursements">
          <Text style={styles.groupLabel}>PER DIEM CATEGORY</Text>
          <SegmentedChoice
            choices={PER_DIEM_CHOICES}
            onChange={setPerDiemCategory}
            value={perDiemCategory}
          />
          <FormField
            keyboardType="decimal-pad"
            label="Estimated per diem rate / TAFB hour"
            note="Leave blank when the rate is unknown. The result will remain pending."
            onChangeText={setPerDiemHourlyRate}
            placeholder="Rate per hour"
            value={perDiemHourlyRate}
          />
          <FormField
            keyboardType="decimal-pad"
            label="Actual per diem report amount"
            note="When supplied, this overrides the TAFB estimate."
            onChangeText={setActualPerDiem}
            placeholder="0.00"
            value={actualPerDiem}
          />
          <FormField
            keyboardType="decimal-pad"
            label="Reimbursement / expense items"
            note="Hotel, transportation, meals, incidentals, or out-of-pocket costs. Kept separate from wages."
            onChangeText={setReimbursements}
            placeholder="0.00"
            value={reimbursements}
          />
        </SectionCard>

        <SectionCard title="Credit calculation">
          <ResultRow
            label="Duty-period greater-of"
            value={formatMinutes(estimate.dutyPeriodCredit)}
          />
          <ResultRow
            label="TAFB trip rig"
            value={formatMinutes(estimate.tripRigMinutes)}
          />
          <ResultRow
            label="Original/revised protection"
            value={formatMinutes(estimate.revisionProtectedMinutes)}
          />
          <ResultRow
            emphasized
            label="Estimated trip credit"
            value={formatMinutes(estimate.tripCreditMinutes)}
          />
          <Text style={styles.appliedRule}>
            Applied factor:{' '}
            {estimate.winningRules.length > 0
              ? estimate.winningRules.join(' / ')
              : 'Not enough information'}
          </Text>
          <View style={styles.divider} />
          <ResultRow
            label="Entered pay-period credit"
            value={formatMinutes(estimate.enteredPayPeriodMinutes)}
          />
          <ResultRow
            label="Applicable guarantee"
            value={formatMinutes(estimate.guaranteeMinutes)}
          />
          <ResultRow
            emphasized
            label="Estimated paid credit"
            value={formatMinutes(estimate.paidCreditMinutes)}
          />
          <Text style={styles.capText}>
            Compliance-review threshold: {formatMinutes(estimate.capMinutes)}. This
            screen warns but does not automatically cap pay.
          </Text>
        </SectionCard>

        <SectionCard title="Estimated value">
          <ResultRow
            label="This trip base-wage contribution"
            value={formatCurrency(estimate.tripBaseWage)}
          />
          <ResultRow
            label="Pay-period base wage"
            value={formatCurrency(estimate.payPeriodBaseWage)}
          />
          <ResultRow
            label={`International premium (${formatMinutes(
              estimate.assumedInternationalMinutes
            )})`}
            value={formatCurrency(estimate.internationalPremiumAmount)}
          />
          <ResultRow
            label="Other wage premiums"
            value={formatCurrency(estimate.otherPremiumAmount)}
          />
          <ResultRow
            emphasized
            label="Gross wage estimate"
            value={formatCurrency(estimate.grossWage)}
          />
          <View style={styles.divider} />
          <ResultRow
            label={
              estimate.perDiemIsReported
                ? 'Per diem report amount'
                : `${formatCategory(perDiemCategory)} per diem estimate`
            }
            value={formatCurrency(estimate.estimatedPerDiem)}
          />
          <ResultRow
            label="Reimbursements / expenses"
            value={formatCurrency(estimate.reimbursementAmount)}
          />
          <ResultRow
            emphasized
            label={
              estimate.estimatedPerDiem === null
                ? 'Known expected value · per diem pending'
                : 'Total expected value'
            }
            value={formatCurrency(estimate.knownExpectedValue)}
          />
        </SectionCard>

        <SectionCard title="Confidence and remarks">
          <View
            style={[
              styles.confidenceBadge,
              estimate.confidence === 'GREEN'
                ? styles.confidenceGreen
                : estimate.confidence === 'YELLOW'
                  ? styles.confidenceYellow
                  : styles.confidenceRed
            ]}
          >
            <Text style={styles.confidenceText}>{estimate.confidence}</Text>
          </View>

          {estimate.remarks.map((remark, index) => (
            <View key={`${remark}-${index}`} style={styles.remarkRow}>
              <Text style={styles.remarkBullet}>•</Text>
              <Text style={styles.remarkText}>{remark}</Text>
            </View>
          ))}
        </SectionCard>

        <Text style={styles.footer}>
          Estimate worksheet only. Verify final credit, premiums, per diem, expenses,
          taxes, deductions, and contract compliance against official UPS/IPA records.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0b0f16',
    flex: 1
  },
  content: {
    gap: 14,
    paddingBottom: 52,
    paddingHorizontal: 16,
    paddingTop: 18
  },
  hero: {
    gap: 7,
    paddingBottom: 4
  },
  eyebrow: {
    color: '#85b7ff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3
  },
  title: {
    color: '#f5f8fc',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.7
  },
  subtitle: {
    color: '#9dacbf',
    fontSize: 14,
    lineHeight: 21
  },
  notice: {
    backgroundColor: '#302815',
    borderColor: '#75632d',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    marginTop: 4,
    padding: 12
  },
  noticeTitle: {
    color: '#ffd76b',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1
  },
  noticeText: {
    color: '#f1dfad',
    fontSize: 12,
    lineHeight: 18
  },
  link: {
    color: '#85b7ff',
    fontSize: 12,
    fontWeight: '800'
  },
  field: {
    gap: 6
  },
  fieldLabel: {
    color: '#dce5ef',
    fontSize: 13,
    fontWeight: '700'
  },
  input: {
    backgroundColor: '#0f141d',
    borderColor: '#354158',
    borderRadius: 11,
    borderWidth: 1,
    color: '#f4f7fb',
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
    paddingVertical: 11
  },
  fieldNote: {
    color: '#7f8da1',
    fontSize: 11,
    lineHeight: 16
  },
  groupLabel: {
    color: '#85b7ff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  segment: {
    alignItems: 'center',
    backgroundColor: '#0f141d',
    borderColor: '#354158',
    borderRadius: 10,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: '46%',
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  segmentActive: {
    backgroundColor: '#d6e7ff',
    borderColor: '#d6e7ff'
  },
  segmentText: {
    color: '#9dacbf',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  segmentTextActive: {
    color: '#142033'
  },
  twoColumnRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10
  },
  column: {
    flex: 1
  },
  help: {
    color: '#8e9caf',
    fontSize: 12,
    lineHeight: 18
  },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 29
  },
  resultRowEmphasized: {
    backgroundColor: '#0f2030',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  resultLabel: {
    color: '#aab6c6',
    flex: 1,
    fontSize: 13
  },
  resultLabelStrong: {
    color: '#dcecff',
    fontWeight: '800'
  },
  resultValue: {
    color: '#eef3f8',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'right'
  },
  resultValueStrong: {
    color: '#8ec5ff',
    fontSize: 16,
    fontWeight: '900'
  },
  appliedRule: {
    color: '#85b7ff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18
  },
  capText: {
    color: '#7f8da1',
    fontSize: 11,
    lineHeight: 16
  },
  divider: {
    backgroundColor: '#2b3548',
    height: 1,
    marginVertical: 2
  },
  confidenceBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    minWidth: 86,
    paddingHorizontal: 16,
    paddingVertical: 8
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
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1
  },
  remarkRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8
  },
  remarkBullet: {
    color: '#85b7ff',
    fontSize: 16,
    lineHeight: 20
  },
  remarkText: {
    color: '#aeb9c8',
    flex: 1,
    fontSize: 12,
    lineHeight: 19
  },
  footer: {
    color: '#69768a',
    fontSize: 11,
    lineHeight: 17,
    paddingHorizontal: 8,
    textAlign: 'center'
  }
});
