export type ForecastFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export type ForecastEvent = {
  amount: number;
  currency: string;
  frequency: ForecastFrequency;
  nextExpectedAt: number;
};

export type ForecastInput = {
  startingBalance: number;
  currency: string;
  now: number;
  horizonDays?: number;
  inflows: ForecastEvent[];
  outflows: ForecastEvent[];
};

export type ForecastPoint = {
  date: string;
  projectedBalance: number;
  expectedInflow: number;
  expectedOutflow: number;
};

export type ForecastResult = {
  currency: string;
  horizonDays: number;
  startingBalance: number;
  endingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  points: ForecastPoint[];
};

const DAY_MS = 86_400_000;
const DEFAULT_HORIZON_DAYS = 30;

const FREQUENCY_DAYS: Record<ForecastFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365
};

export function computeBalanceForecast(input: ForecastInput): ForecastResult {
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const horizonStart = startOfUtcDay(input.now);
  const horizonEnd = horizonStart + horizonDays * DAY_MS;

  const inflowEvents = expandEvents(input.inflows, input.currency, horizonStart, horizonEnd);
  const outflowEvents = expandEvents(input.outflows, input.currency, horizonStart, horizonEnd);

  const points: ForecastPoint[] = [];
  let runningBalance = input.startingBalance;
  let totalInflow = 0;
  let totalOutflow = 0;

  for (let dayIndex = 1; dayIndex <= horizonDays; dayIndex += 1) {
    const dayStart = horizonStart + dayIndex * DAY_MS;
    const dayEnd = dayStart + DAY_MS;

    const expectedInflow = sumEventsInRange(inflowEvents, dayStart, dayEnd);
    const expectedOutflow = sumEventsInRange(outflowEvents, dayStart, dayEnd);

    runningBalance += expectedInflow - expectedOutflow;
    totalInflow += expectedInflow;
    totalOutflow += expectedOutflow;

    points.push({
      date: toIsoDate(dayStart),
      projectedBalance: runningBalance,
      expectedInflow,
      expectedOutflow
    });
  }

  return {
    currency: input.currency,
    horizonDays,
    startingBalance: input.startingBalance,
    endingBalance: runningBalance,
    totalInflow,
    totalOutflow,
    points
  };
}

function expandEvents(
  events: ForecastEvent[],
  currency: string,
  windowStart: number,
  windowEnd: number
): Array<{ at: number; magnitude: number }> {
  const result: Array<{ at: number; magnitude: number }> = [];
  for (const event of events) {
    if (event.currency !== currency) continue;
    if (!Number.isFinite(event.nextExpectedAt) || !Number.isFinite(event.amount)) continue;
    const stepDays = FREQUENCY_DAYS[event.frequency];
    if (!stepDays) continue;
    const stepMs = stepDays * DAY_MS;
    const magnitude = Math.abs(event.amount);
    if (magnitude === 0) continue;

    let cursor = event.nextExpectedAt;
    while (cursor < windowStart) cursor += stepMs;
    while (cursor < windowEnd) {
      result.push({ at: cursor, magnitude });
      cursor += stepMs;
    }
  }
  return result;
}

function sumEventsInRange(
  events: Array<{ at: number; magnitude: number }>,
  rangeStart: number,
  rangeEnd: number
) {
  let total = 0;
  for (const event of events) {
    if (event.at >= rangeStart && event.at < rangeEnd) {
      total += event.magnitude;
    }
  }
  return total;
}

function startOfUtcDay(epochMs: number) {
  const date = new Date(epochMs);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function toIsoDate(epochMs: number) {
  return new Date(epochMs).toISOString().slice(0, 10);
}
