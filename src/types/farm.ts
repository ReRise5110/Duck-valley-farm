export type BarnStatus = 'ACTIVE' | 'CLEANING' | 'DISINFECTING' | 'RESTING' | 'READY';

export type CalendarCategory =
  | 'PLACEMENT'
  | 'VACCINE'
  | 'HEALTH'
  | 'HARVEST'
  | 'CLEANING'
  | 'CUSTOM';

export type PixelStickerType = 'duckling' | 'syringe' | 'heart' | 'crate' | 'broom' | 'star';

export type HuddlingState = 'OPTIMAL' | 'HUDDLING_COLD' | 'DISPERSED_HOT' | 'DRAFT_SIDE';

export interface MortalityEntry {
  id: string;
  date: string;
  type: 'CULL' | 'MORTALITY';
  count: number;
  reason: string;
}

export interface WeightLogEntry {
  id: string;
  date: string;
  timestamp: string;
  cycleDay: number;
  weightsG: number[];
  avgWeightG: number;
  adgGramsPerDay?: number;
  uniformityPct: number;
  note?: string;
}

export interface Barn {
  id: string;
  name: string;
  breed: string;
  areaSqm: number;
  initialDucks: number;
  currentDucks: number;
  culledDucks: number;
  mortalityDucks: number;
  initialWeightG: number;
  currentAvgWeightG: number;
  cycleDays: number;
  currentCycleDay: number;
  startDate: string;
  status: BarnStatus;
  cumulativeFeedKg: number;
  sampleWeightsG: number[];
  weightLogs?: WeightLogEntry[];
  mortalityLogs: MortalityEntry[];
  cleaningChecklist: {
    muckOut: boolean;
    washAndScrub: boolean;
    disinfect: boolean;
    restDaysCompleted: number;
    targetRestDays: number;
  };
  finalFcr?: number;
  finalSoldWeightKg?: number;
}

export interface CalendarEvent {
  id: string;
  barnId: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: CalendarCategory;
  sticker: PixelStickerType;
  notifyGoogleCalendar: boolean;
  notifyLine: boolean;
  syncedToGoogleCalendar?: boolean;
  notes?: string;
}

export interface FeedIngredient {
  name: string;
  percentage: number;
}

export interface FeedFormula {
  id: string;
  stage: 'STARTER' | 'GROWER' | 'FINISHER';
  name: string;
  ageRangeDays: string;
  proteinPct: number;
  energyKcalPerKg: number;
  pricePerKg: number;
  ingredients: FeedIngredient[];
}

export interface FeedSilo {
  id: string;
  name: string;
  formulaId: string;
  capacityKg: number;
  remainingKg: number;
  storedDate: string;
  maxShelfLifeDays: number;
}

export interface FeedDispenseLog {
  id: string;
  date: string;
  barnId: string;
  siloId: string;
  amountKg: number;
  costThb: number;
  autoDeducted: boolean;
  note?: string;
}

export interface BrooderAdjustmentLog {
  id: string;
  timestamp: string;
  reason: string;
  prevTempC: number;
  newTempC: number;
  mode: 'AUTO' | 'MANUAL';
}

export interface BarnEnvironment {
  barnId: string;
  temperatureC: number;
  humidityPct: number;
  windSpeedMs: number;
  ammoniaPpm: number;
  lightOn: boolean;
  lightIntensityPct: number;
  lightStartTime: string;
  lightEndTime: string;
  isBroodingBarn: boolean;
  brooderEnabled: boolean;
  brooderTargetTempC: number;
  brooderPowerPct: number;
  huddlingState: HuddlingState;
  autoBrooderEnabled: boolean;
  autoBrooderGraceSeconds: number;
  lastHuddlingDetectedAt: number | null;
  autoAdjustLogs: BrooderAdjustmentLog[];
}

export interface SalesRecord {
  id: string;
  barnId: string;
  batchCode: string;
  saleDate: string;
  daysRaised: number;
  birdsSold: number;
  totalWeightKg: number;
  pricingMode: 'PER_BIRD' | 'PER_KG';
  pricePerUnit: number;
  ducklingCostThb: number;
  feedCostThb: number;
  medicineCostThb: number;
  utilityLaborCostThb: number;
  costPerBirdThb: number;
  totalRevenueThb: number;
  netProfitThb: number;
  fcr: number;
  fcrStatus?: 'ESTIMATED' | 'FINAL';
  carcassGradeAPct: number;
  carcassGradeBPct: number;
  buyerFeedback: string;
  issuesEncountered: string;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  direction: 'PUSH' | 'PULL' | 'BIDIRECTIONAL';
  channel: 'GOOGLE_SHEETS' | 'GOOGLE_CALENDAR' | 'LINE' | 'LOCAL_SHEET';
  summary: string;
}

export interface ClosedBatch {
  id: string;
  barnId: string;
  batchName: string;
  barnName: string;
  startDate: string;
  closedDate: string;
  initialDucks: number;
  soldDucks: number;
  survivalRatePct: number;
  totalSoldWeightKg: number;
  avgWeightPerBirdKg: number;
  totalFeedUsedKg: number;
  finalFcr: number;
  totalRevenueThb: number;
  totalCostThb: number;
  netProfitThb: number;
}

export interface FarmData {
  id: string;
  name: string;
  location: string;
  farmerName: string;
  farmerAvatar: 'sunhat' | 'ribbon' | 'straw' | 'bandana';
  season: 'Spring' | 'Summer' | 'Autumn';
  farmDay: number;
  createdAt: string;
  lastSyncedAt: string;
  googleSheetId: string;
  googleSheetTitle: string;
  appsScriptWebhookUrl: string;
  lineNotifyEnabled: boolean;
  barns: Barn[];
  calendarEvents: CalendarEvent[];
  feedFormulas: FeedFormula[];
  feedSilos: FeedSilo[];
  feedLogs: FeedDispenseLog[];
  environments: BarnEnvironment[];
  salesRecords: SalesRecord[];
  closedBatches?: ClosedBatch[];
  syncLogs: SyncLogEntry[];
}

export type ActiveModalType =
  | 'NONE'
  | 'BARN'
  | 'SILO'
  | 'FARMHOUSE'
  | 'SALES'
  | 'SYNC'
  | 'DAILY_LOG';
