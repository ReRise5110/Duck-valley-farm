import {
  BarnStatus,
  CalendarCategory,
  CalendarEvent,
  ClosedBatch,
  FarmData,
  FeedDispenseLog,
  HuddlingState,
  MortalityEntry,
  PixelStickerType,
  WeightLogEntry,
} from '../types/farm';

export type SheetTabKey =
  | 'Barns'
  | 'Weight_Logs'
  | 'Mortality_Logs'
  | 'FeedSilos'
  | 'Feed_Logs'
  | 'Environments'
  | 'Sales'
  | 'Calendar'
  | 'Batch_History';

export interface SheetWorkbook {
  Barns: string[][];
  Weight_Logs: string[][];
  Mortality_Logs: string[][];
  FeedSilos: string[][];
  Feed_Logs: string[][];
  Environments: string[][];
  Sales: string[][];
  Calendar: string[][];
  Batch_History: string[][];
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed.split(/[?#]/)[0].trim();
}

function parseSheetNum(raw: string | undefined, fallback = 0): number {
  if (raw === undefined || raw === null) return fallback;
  const cleaned = String(raw).replace(/,/g, '').trim();
  if (!cleaned) return fallback;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function parseSheetBool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined || raw === null) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'ใช่') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'ไม่') {
    return false;
  }
  return fallback;
}

export function farmToWorkbook(farm: FarmData): SheetWorkbook {
  const barnsRows: string[][] = [
    [
      'id',
      'name',
      'breed',
      'areaSqm',
      'initialDucks',
      'currentDucks',
      'culledDucks',
      'mortalityDucks',
      'initialWeightG',
      'currentAvgWeightG',
      'cycleDays',
      'currentCycleDay',
      'status',
      'startDate',
      'cumulativeFeedKg',
    ],
    ...farm.barns.map((b) => [
      b.id,
      b.name,
      b.breed,
      String(b.areaSqm),
      String(b.initialDucks),
      String(b.currentDucks),
      String(b.culledDucks),
      String(b.mortalityDucks),
      String(b.initialWeightG),
      String(b.currentAvgWeightG),
      String(b.cycleDays),
      String(b.currentCycleDay),
      b.status,
      b.startDate,
      String(b.cumulativeFeedKg),
    ]),
  ];

  const weightLogRows: string[][] = [
    [
      'id',
      'barnId',
      'barnName',
      'date',
      'timestamp',
      'cycleDay',
      'weightsG',
      'avgWeightG',
      'adgGramsPerDay',
      'uniformityPct',
      'note',
    ],
    ...farm.barns.flatMap((b) =>
      (b.weightLogs || []).map((w) => {
        const adg =
          typeof w.adgGramsPerDay === 'number'
            ? w.adgGramsPerDay
            : w.cycleDay > 0
              ? Number((Math.max(0, w.avgWeightG - b.initialWeightG) / w.cycleDay).toFixed(1))
              : 0;
        return [
          w.id,
          b.id,
          b.name,
          w.date,
          w.timestamp,
          String(w.cycleDay),
          w.weightsG.join(', '),
          String(w.avgWeightG),
          String(adg),
          String(w.uniformityPct),
          w.note || '',
        ];
      })
    ),
  ];

  const mortalityLogRows: string[][] = [
    ['id', 'barnId', 'barnName', 'date', 'type', 'count', 'reason'],
    ...farm.barns.flatMap((b) =>
      (b.mortalityLogs || []).map((m) => [
        m.id,
        b.id,
        b.name,
        m.date,
        m.type,
        String(m.count),
        m.reason,
      ])
    ),
  ];

  const siloRows: string[][] = [
    ['id', 'name', 'formulaId', 'capacityKg', 'remainingKg', 'storedDate', 'maxShelfLifeDays'],
    ...farm.feedSilos.map((s) => [
      s.id,
      s.name,
      s.formulaId,
      String(s.capacityKg),
      String(s.remainingKg),
      s.storedDate,
      String(s.maxShelfLifeDays),
    ]),
  ];

  const feedLogRows: string[][] = [
    ['id', 'date', 'barnId', 'barnName', 'siloId', 'amountKg', 'costThb', 'autoDeducted', 'note'],
    ...farm.feedLogs.map((fl) => {
      const barnName = farm.barns.find((b) => b.id === fl.barnId)?.name || fl.barnId;
      return [
        fl.id,
        fl.date,
        fl.barnId,
        barnName,
        fl.siloId,
        String(fl.amountKg),
        String(fl.costThb),
        String(fl.autoDeducted),
        fl.note || '',
      ];
    }),
  ];

  const envRows: string[][] = [
    [
      'barnId',
      'temperatureC',
      'humidityPct',
      'windSpeedMs',
      'ammoniaPpm',
      'lightOn',
      'lightIntensityPct',
      'brooderEnabled',
      'brooderTargetTempC',
      'huddlingState',
      'autoBrooderEnabled',
    ],
    ...farm.environments.map((e) => [
      e.barnId,
      String(e.temperatureC),
      String(e.humidityPct),
      String(e.windSpeedMs),
      String(e.ammoniaPpm),
      String(e.lightOn),
      String(e.lightIntensityPct),
      String(e.brooderEnabled),
      String(e.brooderTargetTempC),
      e.huddlingState,
      String(e.autoBrooderEnabled),
    ]),
  ];

  const salesRows: string[][] = [
    [
      'id',
      'barnId',
      'batchCode',
      'saleDate',
      'daysRaised',
      'birdsSold',
      'totalWeightKg',
      'pricingMode',
      'pricePerUnit',
      'costPerBirdThb',
      'totalRevenueThb',
      'netProfitThb',
      'fcr',
      'carcassGradeAPct',
      'buyerFeedback',
    ],
    ...farm.salesRecords.map((r) => [
      r.id,
      r.barnId,
      r.batchCode,
      r.saleDate,
      String(r.daysRaised),
      String(r.birdsSold),
      String(r.totalWeightKg),
      r.pricingMode,
      String(r.pricePerUnit),
      String(r.costPerBirdThb),
      String(r.totalRevenueThb),
      String(r.netProfitThb),
      String(r.fcr),
      String(r.carcassGradeAPct),
      r.buyerFeedback,
    ]),
  ];

  const calendarRows: string[][] = [
    ['id', 'barnId', 'date', 'title', 'category', 'sticker', 'notifyGoogleCalendar', 'notifyLine', 'notes'],
    ...farm.calendarEvents.map((c) => [
      c.id,
      c.barnId,
      c.date,
      c.title,
      c.category,
      c.sticker,
      String(c.notifyGoogleCalendar),
      String(c.notifyLine),
      c.notes || '',
    ]),
  ];

  const batchHistoryRows: string[][] = [
    [
      'id',
      'batchName',
      'barnName',
      'barnId',
      'startDate',
      'closedDate',
      'initialDucks',
      'soldDucks',
      'survivalRatePct',
      'totalSoldWeightKg',
      'avgWeightPerBirdKg',
      'totalFeedUsedKg',
      'finalFcr',
      'totalRevenueThb',
      'totalCostThb',
      'netProfitThb',
    ],
    ...(farm.closedBatches ?? []).map((cb) => [
      cb.id,
      cb.batchName,
      cb.barnName,
      cb.barnId,
      cb.startDate,
      cb.closedDate,
      String(cb.initialDucks),
      String(cb.soldDucks),
      String(cb.survivalRatePct),
      String(cb.totalSoldWeightKg),
      String(cb.avgWeightPerBirdKg),
      String(cb.totalFeedUsedKg),
      String(cb.finalFcr),
      String(cb.totalRevenueThb),
      String(cb.totalCostThb),
      String(cb.netProfitThb),
    ]),
  ];

  return {
    Barns: barnsRows,
    Weight_Logs: weightLogRows,
    Mortality_Logs: mortalityLogRows,
    FeedSilos: siloRows,
    Feed_Logs: feedLogRows,
    Environments: envRows,
    Sales: salesRows,
    Calendar: calendarRows,
    Batch_History: batchHistoryRows,
  };
}

const VALID_BARN_STATUSES: BarnStatus[] = ['ACTIVE', 'CLEANING', 'DISINFECTING', 'RESTING', 'READY'];
const VALID_HUDDLING: HuddlingState[] = ['OPTIMAL', 'HUDDLING_COLD', 'DISPERSED_HOT', 'DRAFT_SIDE'];
const VALID_CATEGORIES: CalendarCategory[] = ['PLACEMENT', 'VACCINE', 'HEALTH', 'HARVEST', 'CLEANING', 'CUSTOM'];
const VALID_STICKERS: PixelStickerType[] = ['duckling', 'syringe', 'heart', 'crate', 'broom', 'star'];

export function applyWorkbookToFarm(farm: FarmData, workbook: Partial<SheetWorkbook>): FarmData {
  let nextBarns = [...farm.barns];
  if (workbook.Barns && workbook.Barns.length > 1) {
    const [, ...rows] = workbook.Barns;
    nextBarns = rows
      .filter((r) => r[0]?.trim() && r[1]?.trim())
      .map((r) => {
        const id = r[0].trim();
        const existing = farm.barns.find((b) => b.id === id);
        const initialDucks = parseSheetNum(r[4], 0);
        const culledDucks = parseSheetNum(r[6], 0);
        const mortalityDucks = parseSheetNum(r[7], 0);
        const parsedCurrent = parseSheetNum(r[5], -1);
        const currentDucks =
          parsedCurrent >= 0
            ? parsedCurrent
            : Math.max(0, initialDucks - culledDucks - mortalityDucks);
        const statusCandidate = (r[12] || 'ACTIVE').trim().toUpperCase() as BarnStatus;
        return {
          id,
          name: r[1].trim(),
          breed: r[2]?.trim() || 'Cherry Valley SM3',
          areaSqm: parseSheetNum(r[3], 350),
          initialDucks,
          currentDucks,
          culledDucks,
          mortalityDucks,
          initialWeightG: parseSheetNum(r[8], 52),
          currentAvgWeightG: parseSheetNum(r[9], 0),
          cycleDays: parseSheetNum(r[10], 45),
          currentCycleDay: parseSheetNum(r[11], 0),
          startDate: r[13]?.trim() || existing?.startDate || new Date().toISOString().slice(0, 10),
          status: VALID_BARN_STATUSES.includes(statusCandidate) ? statusCandidate : 'ACTIVE',
          cumulativeFeedKg:
            r[14] !== undefined && String(r[14]).trim() !== ''
              ? parseSheetNum(r[14], existing?.cumulativeFeedKg ?? 0)
              : existing?.cumulativeFeedKg ?? 0,
          sampleWeightsG: existing?.sampleWeightsG ?? [],
          weightLogs: existing?.weightLogs || [],
          mortalityLogs: existing?.mortalityLogs || [],
          cleaningChecklist: existing?.cleaningChecklist || {
            muckOut: true,
            washAndScrub: true,
            disinfect: true,
            restDaysCompleted: 14,
            targetRestDays: 14,
          },
          finalFcr: existing?.finalFcr,
          finalSoldWeightKg: existing?.finalSoldWeightKg,
        };
      });
  }

  if (workbook.Weight_Logs && workbook.Weight_Logs.length > 1) {
    const [, ...rows] = workbook.Weight_Logs;
    const grouped = new Map<string, WeightLogEntry[]>();
    rows
      .filter((r) => r[0]?.trim() && r[1]?.trim())
      .forEach((r) => {
        const barnId = r[1].trim();
        const weightsG = String(r[6] || '')
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((n) => Number.isFinite(n) && n > 0);
        const avgWeightG = parseSheetNum(r[7], 0);
        const adgGramsPerDay =
          r[8] !== undefined && String(r[8]).trim() !== '' ? parseSheetNum(r[8], 0) : undefined;
        const entry: WeightLogEntry = {
          id: r[0].trim(),
          date: r[3]?.trim() || new Date().toISOString().slice(0, 10),
          timestamp: r[4]?.trim() || '00:00',
          cycleDay: parseSheetNum(r[5], 0),
          weightsG: weightsG.length > 0 ? weightsG : avgWeightG > 0 ? [avgWeightG] : [],
          avgWeightG,
          adgGramsPerDay,
          uniformityPct: parseSheetNum(r[9], 0),
          note: r[10]?.trim() || undefined,
        };
        const list = grouped.get(barnId) || [];
        list.push(entry);
        grouped.set(barnId, list);
      });
    nextBarns = nextBarns.map((b) =>
      grouped.has(b.id) ? { ...b, weightLogs: grouped.get(b.id)! } : b
    );
  }

  if (workbook.Mortality_Logs && workbook.Mortality_Logs.length > 1) {
    const [, ...rows] = workbook.Mortality_Logs;
    const grouped = new Map<string, MortalityEntry[]>();
    rows
      .filter((r) => r[0]?.trim() && r[1]?.trim())
      .forEach((r) => {
        const barnId = r[1].trim();
        const typeRaw = (r[4] || 'MORTALITY').trim().toUpperCase();
        const entry: MortalityEntry = {
          id: r[0].trim(),
          date: r[3]?.trim() || new Date().toISOString().slice(0, 10),
          type: typeRaw === 'CULL' ? 'CULL' : 'MORTALITY',
          count: parseSheetNum(r[5], 0),
          reason: r[6]?.trim() || '',
        };
        const list = grouped.get(barnId) || [];
        list.push(entry);
        grouped.set(barnId, list);
      });
    nextBarns = nextBarns.map((b) =>
      grouped.has(b.id) ? { ...b, mortalityLogs: grouped.get(b.id)! } : b
    );
  }

  let nextSilos = [...farm.feedSilos];
  if (workbook.FeedSilos && workbook.FeedSilos.length > 1) {
    const [, ...rows] = workbook.FeedSilos;
    nextSilos = rows
      .filter((r) => r[0]?.trim() && r[1]?.trim())
      .map((r) => ({
        id: r[0].trim(),
        name: r[1].trim(),
        formulaId: r[2]?.trim() || farm.feedFormulas[0]?.id || 'formula-starter',
        capacityKg: parseSheetNum(r[3], 3000),
        remainingKg: parseSheetNum(r[4], 0),
        storedDate: r[5]?.trim() || new Date().toISOString().slice(0, 10),
        maxShelfLifeDays: parseSheetNum(r[6], 35),
      }));
  }

  let nextEnvs = [...farm.environments];
  if (workbook.Environments && workbook.Environments.length > 1) {
    const [, ...rows] = workbook.Environments;
    nextEnvs = rows
      .filter((r) => r[0]?.trim())
      .map((r) => {
        const barnId = r[0].trim();
        const existing = farm.environments.find((e) => e.barnId === barnId);
        const huddlingCandidate = (r[9] || 'OPTIMAL').trim() as HuddlingState;
        const brooderEnabled = parseSheetBool(r[7], existing?.brooderEnabled ?? false);
        return {
          barnId,
          temperatureC: parseSheetNum(r[1], 28),
          humidityPct: parseSheetNum(r[2], 65),
          windSpeedMs: parseSheetNum(r[3], 1.0),
          ammoniaPpm: parseSheetNum(r[4], 5),
          lightOn: parseSheetBool(r[5], existing?.lightOn ?? false),
          lightIntensityPct: parseSheetNum(r[6], 60),
          lightStartTime: existing?.lightStartTime || '18:00',
          lightEndTime: existing?.lightEndTime || '06:00',
          isBroodingBarn: existing?.isBroodingBarn ?? brooderEnabled,
          brooderEnabled,
          brooderTargetTempC: parseSheetNum(r[8], 30),
          brooderPowerPct: existing?.brooderPowerPct ?? 60,
          huddlingState: VALID_HUDDLING.includes(huddlingCandidate) ? huddlingCandidate : 'OPTIMAL',
          autoBrooderEnabled: parseSheetBool(r[10], existing?.autoBrooderEnabled ?? true),
          autoBrooderGraceSeconds: existing?.autoBrooderGraceSeconds ?? 10,
          lastHuddlingDetectedAt: existing?.lastHuddlingDetectedAt ?? null,
          autoAdjustLogs: existing?.autoAdjustLogs ?? [],
        };
      });
  }

  let nextCalendar = [...farm.calendarEvents];
  if (workbook.Calendar && workbook.Calendar.length > 1) {
    const [, ...rows] = workbook.Calendar;
    nextCalendar = rows
      .filter((r) => r[0]?.trim() && r[2]?.trim() && r[3]?.trim())
      .map((r) => {
        const id = r[0].trim();
        const existing = farm.calendarEvents.find((c) => c.id === id);
        const cat = (r[4] || 'CUSTOM').trim().toUpperCase() as CalendarCategory;
        const stk = (r[5] || 'star').trim() as PixelStickerType;
        return {
          id,
          barnId: r[1]?.trim() || farm.barns[0]?.id || 'barn-1',
          date: r[2].trim(),
          title: r[3].trim(),
          category: VALID_CATEGORIES.includes(cat) ? cat : 'CUSTOM',
          sticker: VALID_STICKERS.includes(stk) ? stk : 'star',
          notifyGoogleCalendar: parseSheetBool(r[6], false),
          notifyLine: parseSheetBool(r[7], false),
          syncedToGoogleCalendar: existing?.syncedToGoogleCalendar,
          notes: r[8]?.trim() || undefined,
        };
      });
  }

  let nextClosedBatches = [...(farm.closedBatches ?? [])];
  if (workbook.Batch_History && workbook.Batch_History.length > 1) {
    const [, ...rows] = workbook.Batch_History;
    nextClosedBatches = rows
      .filter((r) => r[0]?.trim() && r[1]?.trim())
      .map((r): ClosedBatch => {
        const initialDucks = parseSheetNum(r[6], 0);
        const soldDucks = parseSheetNum(r[7], 0);
        const totalSoldWeightKg = parseSheetNum(r[9], 0);
        const totalFeedUsedKg = parseSheetNum(r[11], 0);
        const totalRevenueThb = parseSheetNum(r[13], 0);
        const totalCostThb = parseSheetNum(r[14], 0);
        const hasSurvival = r[8] !== undefined && String(r[8]).trim() !== '';
        const survivalRatePct = hasSurvival
          ? parseSheetNum(r[8], 0)
          : initialDucks > 0
            ? Number(((soldDucks / initialDucks) * 100).toFixed(1))
            : 0;
        const hasAvgWt = r[10] !== undefined && String(r[10]).trim() !== '';
        const avgWeightPerBirdKg = hasAvgWt
          ? parseSheetNum(r[10], 0)
          : soldDucks > 0
            ? Number((totalSoldWeightKg / soldDucks).toFixed(2))
            : 0;
        const hasFcr = r[12] !== undefined && String(r[12]).trim() !== '';
        const finalFcr = hasFcr
          ? parseSheetNum(r[12], 0)
          : totalSoldWeightKg > 0
            ? Number((totalFeedUsedKg / totalSoldWeightKg).toFixed(2))
            : 0;
        const hasProfit = r[15] !== undefined && String(r[15]).trim() !== '';
        const netProfitThb = hasProfit
          ? parseSheetNum(r[15], 0)
          : Math.round(totalRevenueThb - totalCostThb);

        return {
          id: r[0].trim(),
          batchName: r[1].trim(),
          barnName: r[2]?.trim() || 'โรงเรือน',
          barnId: r[3]?.trim() || farm.barns[0]?.id || 'barn-1',
          startDate: r[4]?.trim() || new Date().toISOString().slice(0, 10),
          closedDate: r[5]?.trim() || new Date().toISOString().slice(0, 10),
          initialDucks,
          soldDucks,
          survivalRatePct,
          totalSoldWeightKg,
          avgWeightPerBirdKg,
          totalFeedUsedKg,
          finalFcr,
          totalRevenueThb,
          totalCostThb,
          netProfitThb,
        };
      });
  }

  let nextFeedLogs: FeedDispenseLog[] = [...farm.feedLogs];
  if (workbook.Feed_Logs && workbook.Feed_Logs.length > 1) {
    const [, ...rows] = workbook.Feed_Logs;
    nextFeedLogs = rows
      .filter((r) => r[0]?.trim() && r[2]?.trim())
      .map((r) => ({
        id: r[0].trim(),
        date: r[1]?.trim() || new Date().toISOString().slice(0, 10),
        barnId: r[2].trim(),
        siloId: r[4]?.trim() || farm.feedSilos[0]?.id || 'silo-1',
        amountKg: parseSheetNum(r[5], 0),
        costThb: parseSheetNum(r[6], 0),
        autoDeducted: parseSheetBool(r[7], false),
        note: r[8]?.trim() || undefined,
      }));
  }

  return {
    ...farm,
    barns: nextBarns,
    feedSilos: nextSilos,
    feedLogs: nextFeedLogs,
    environments: nextEnvs,
    calendarEvents: nextCalendar,
    closedBatches: nextClosedBatches,
    lastSyncedAt: new Date().toLocaleString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

async function parseGoogleApiError(res: Response, fallbackMsg: string): Promise<Error> {
  if (res.status === 401) {
    return new Error(
      'GOOGLE_TOKEN_EXPIRED: เซสชัน Google หมดอายุ กรุณากด "อนุญาตสิทธิ์ Google Sheets" ใหม่อีกครั้ง'
    );
  }
  const err = (await res.json().catch(() => ({}))) as {
    error?: {
      message?: string;
      status?: string;
      details?: Array<{ reason?: string }>;
    };
  };
  const message = err.error?.message || '';
  const reasons = err.error?.details?.map((d) => d.reason || '').join(' ') || '';

  if (
    res.status === 403 &&
    (reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
      message.toLowerCase().includes('insufficient authentication scopes') ||
      message.toLowerCase().includes('insufficient permission'))
  ) {
    return new Error(
      'GOOGLE_TOKEN_EXPIRED: บัญชี Google ยังไม่ได้รับสิทธิ์เข้าถึง Google Sheets กรุณากดปุ่ม "อนุญาตสิทธิ์ Google Sheets" แล้วติ๊กเลือกสิทธิ์ทั้งหมด'
    );
  }
  if (
    res.status === 403 &&
    (reasons.includes('SERVICE_DISABLED') || message.includes('has not been used in project'))
  ) {
    return new Error(
      'Google Sheets API ยังไม่ได้เปิดใช้งานในโปรเจกต์ Google Cloud กรุณาเปิดใช้งาน Google Sheets API ใน Google Cloud Console'
    );
  }
  if (res.status === 403) {
    return new Error(
      'ไม่มีสิทธิ์เข้าถึงหรือแก้ไขไฟล์ Google Sheet นี้ (กรุณาตรวจสอบว่าใช้บัญชี Google เดียวกันกับเจ้าของไฟล์ หรือกด "สร้าง Sheet ใหม่")'
    );
  }
  if (res.status === 404) {
    return new Error(
      'ไม่พบ Google Sheet ตาม ID หรือ URL นี้ กรุณาตรวจสอบลิงก์ไฟล์อีกครั้ง หรือกด "สร้าง Sheet ใหม่"'
    );
  }
  return new Error(message || fallbackMsg);
}

export async function createFarmSpreadsheet(
  accessToken: string,
  farm: FarmData
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const tabs: SheetTabKey[] = [
    'Barns',
    'Weight_Logs',
    'Mortality_Logs',
    'FeedSilos',
    'Feed_Logs',
    'Environments',
    'Sales',
    'Calendar',
    'Batch_History',
  ];
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: farm.googleSheetTitle || `${farm.name} - Duck Farm Sync` },
      sheets: tabs.map((t) => ({ properties: { title: t } })),
    }),
  });

  if (!createRes.ok) {
    throw await parseGoogleApiError(createRes, 'สร้าง Google Sheet ไม่สำเร็จ');
  }

  const created = (await createRes.json()) as { spreadsheetId: string; spreadsheetUrl: string };
  await pushFarmToGoogleSheet(accessToken, created.spreadsheetId, farm);
  return created;
}

export async function pushFarmToGoogleSheet(
  accessToken: string,
  spreadsheetIdRaw: string,
  farm: FarmData
): Promise<void> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdRaw);
  const workbook = farmToWorkbook(farm);

  // Check existing sheet tabs so we only write to valid tabs or create missing ones
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!metaRes.ok) {
    throw await parseGoogleApiError(metaRes, 'ไม่สามารถเปิด Google Sheet ได้');
  }
  const meta = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const existingTitles = new Set(meta.sheets?.map((s) => s.properties?.title).filter(Boolean));
  const missingTabs = (Object.keys(workbook) as SheetTabKey[]).filter((t) => !existingTitles.has(t));

  if (missingTabs.length > 0) {
    const addTabRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: missingTabs.map((title) => ({ addSheet: { properties: { title } } })),
        }),
      }
    );
    if (!addTabRes.ok) {
      throw await parseGoogleApiError(addTabRes, 'ไม่สามารถเพิ่มแท็บใน Google Sheet ได้');
    }
  }

  const tabKeys = Object.keys(workbook) as SheetTabKey[];
  // Clear old trailing rows first so deleted records do not stay behind
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ranges: tabKeys.map((tab) => `'${tab}'!A:Z`),
      }),
    }
  );
  if (!clearRes.ok) {
    throw await parseGoogleApiError(clearRes, 'ไม่สามารถล้างข้อมูลเดิมก่อนอัปเดต Google Sheet ได้');
  }

  const data = tabKeys.map((tab) => ({
    range: `'${tab}'!A1`,
    majorDimension: 'ROWS',
    values: workbook[tab],
  }));

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data,
      }),
    }
  );

  if (!updateRes.ok) {
    throw await parseGoogleApiError(updateRes, 'อัปเดตข้อมูลไปยัง Google Sheet ไม่สำเร็จ');
  }
}

export async function pullFarmFromGoogleSheet(
  accessToken: string,
  spreadsheetIdRaw: string,
  farm: FarmData
): Promise<FarmData> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdRaw);
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!metaRes.ok) {
    throw await parseGoogleApiError(metaRes, 'ไม่สามารถอ่านโครงสร้าง Google Sheet ได้');
  }

  const meta = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const availableTitles = new Set(meta.sheets?.map((s) => s.properties?.title).filter(Boolean));
  const targetTabs: SheetTabKey[] = [
    'Barns',
    'Weight_Logs',
    'Mortality_Logs',
    'FeedSilos',
    'Feed_Logs',
    'Environments',
    'Calendar',
    'Batch_History',
  ];
  const workbook: Partial<SheetWorkbook> = {};
  let foundAnyTab = false;

  for (const tab of targetTabs) {
    if (!availableTitles.has(tab)) continue;
    foundAnyTab = true;
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`'${tab}'`)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw await parseGoogleApiError(res, 'ไม่สามารถอ่านข้อมูลจาก Google Sheet ได้');
      }
      continue;
    }
    const json = (await res.json()) as { values?: string[][] };
    if (json.values && json.values.length > 1) {
      workbook[tab] = json.values;
    }
  }

  if (!foundAnyTab) {
    throw new Error(
      'ไม่พบแท็บข้อมูลฟาร์ม (Barns, FeedSilos, Environments, Calendar, Batch_History) ใน Google Sheet นี้ กรุณากด "Push แอป → Google Sheet" ก่อนเพื่อสร้างโครงสร้างตาราง'
    );
  }

  if (Object.keys(workbook).length === 0) {
    throw new Error(
      'Google Sheet นี้ยังไม่มีแถวข้อมูลสำหรับนำเข้า กรุณากรอกข้อมูลในแท็บหรือกด "Push แอป → Google Sheet" ก่อน'
    );
  }

  return applyWorkbookToFarm(farm, workbook);
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  event: CalendarEvent,
  barnName: string,
  farmName: string
): Promise<void> {
  const startDate = event.date;
  const nextDay = new Date(`${startDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const endDate = nextDay.toISOString().slice(0, 10);

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `[${farmName}] ${barnName}: ${event.title}`,
      description: event.notes || `กำหนดการฟาร์มเป็ดเนื้อ (${event.category})`,
      start: { date: startDate },
      end: { date: endDate },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 480 },
          { method: 'email', minutes: 1440 },
        ],
      },
    }),
  });

  if (!res.ok) {
    throw await parseGoogleApiError(res, 'เพิ่มกิจกรรมลง Google Calendar ไม่สำเร็จ');
  }
}

export function downloadCalendarIcs(event: CalendarEvent, barnName: string, farmName: string) {
  const dt = event.date.replace(/-/g, '');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Duck Valley Farm//TH',
    'BEGIN:VEVENT',
    `UID:${event.id}@duckvalley.local`,
    `DTSTART;VALUE=DATE:${dt}`,
    `SUMMARY:[${farmName}] ${barnName} - ${event.title}`,
    `DESCRIPTION:${(event.notes || event.category).replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT8H',
    'ACTION:DISPLAY',
    `DESCRIPTION:แจ้งเตือนฟาร์มเป็ด: ${event.title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.date}-${event.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function rowsToCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const val = String(cell ?? '');
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    )
    .join('\n');
}

export function csvToRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

export async function sendLineFarmNotification(message: string): Promise<{
  sent: boolean;
  mode: string;
  previewText?: string;
  error?: string;
}> {
  const res = await fetch('/api/notify/line', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}
