import { Barn, FeedDispenseLog, FeedFormula, FeedSilo } from '../types/farm';

export type FeedStage = 'STARTER' | 'GROWER' | 'FINISHER';

export interface FeedStageInfo {
  stage: FeedStage;
  labelTh: string;
  ageRangeTh: string;
}

export const FEED_STAGE_INFO: Record<FeedStage, FeedStageInfo> = {
  STARTER: {
    stage: 'STARTER',
    labelTh: 'สูตรเป็ดเล็ก (Starter)',
    ageRangeTh: '0–14 วัน',
  },
  GROWER: {
    stage: 'GROWER',
    labelTh: 'สูตรเป็ดรุ่น (Grower)',
    ageRangeTh: '15–35 วัน',
  },
  FINISHER: {
    stage: 'FINISHER',
    labelTh: 'สูตรเป็ดขุน (Finisher)',
    ageRangeTh: '36 วันขึ้นไป',
  },
};

export function getFeedStageForAge(cycleDay: number): FeedStage {
  if (cycleDay <= 14) return 'STARTER';
  if (cycleDay <= 35) return 'GROWER';
  return 'FINISHER';
}

export interface BarnLivestockMetrics {
  adgGramsPerDay: number;
  fiGramsPerDuckPerDay: number;
  fiCumulativeKgPerDuck: number;
  fcr: number;
  fcrStatus: 'ESTIMATED' | 'FINAL';
  sampleMeanWeightG: number;
  estimatedLiveWeightKg: number;
  fePct: number;
  uniformityPct: number;
  totalWeightGainKg: number;
  effectiveFeedKg: number;
}

export function getSampleMeanWeightG(weights: number[], fallbackAvgG: number): number {
  const valid = weights.filter((w) => Number.isFinite(w) && w > 0);
  if (valid.length === 0) return fallbackAvgG;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function calculateUniformityPct(weights: number[], fallbackAvgG: number): number {
  const valid = weights.filter((w) => Number.isFinite(w) && w > 0);
  if (valid.length === 0) {
    return fallbackAvgG > 0 ? 85.0 : 0;
  }
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (mean <= 0) return 0;
  const lower = mean * 0.9;
  const upper = mean * 1.1;
  const withinRange = valid.filter((w) => w >= lower && w <= upper).length;
  return Number(((withinRange / valid.length) * 100).toFixed(1));
}

export function calculateBarnMetrics(barn: Barn): BarnLivestockMetrics {
  // If batch is closed and finalFcr is locked from actual sale weight
  if (barn.currentDucks === 0 && typeof barn.finalFcr === 'number' && barn.finalFcr > 0) {
    const soldWeightKg = barn.finalSoldWeightKg ?? 0;
    const effectiveFeedKg = barn.cumulativeFeedKg || Number((soldWeightKg * barn.finalFcr).toFixed(1));
    return {
      adgGramsPerDay: 0,
      fiGramsPerDuckPerDay: 0,
      fiCumulativeKgPerDuck: barn.initialDucks > 0 ? Number((effectiveFeedKg / barn.initialDucks).toFixed(2)) : 0,
      fcr: Number(barn.finalFcr.toFixed(2)),
      fcrStatus: 'FINAL',
      sampleMeanWeightG: barn.currentAvgWeightG,
      estimatedLiveWeightKg: soldWeightKg,
      fePct: effectiveFeedKg > 0 ? Number(((soldWeightKg / effectiveFeedKg) * 100).toFixed(1)) : 0,
      uniformityPct: calculateUniformityPct(barn.sampleWeightsG || [], barn.currentAvgWeightG),
      totalWeightGainKg: soldWeightKg,
      effectiveFeedKg,
    };
  }

  const days = Math.max(0, barn.currentCycleDay);
  const activeOrInitial = barn.currentDucks > 0 ? barn.currentDucks : barn.initialDucks;
  const avgBirds =
    barn.initialDucks > 0 && barn.currentDucks > 0
      ? (barn.initialDucks + barn.currentDucks) / 2
      : activeOrInitial;

  const sampleMeanWeightG = Math.round(
    getSampleMeanWeightG(barn.sampleWeightsG || [], barn.currentAvgWeightG)
  );

  if (days === 0 || activeOrInitial === 0 || sampleMeanWeightG <= 0) {
    return {
      adgGramsPerDay: 0,
      fiGramsPerDuckPerDay: 0,
      fiCumulativeKgPerDuck: 0,
      fcr: 0,
      fcrStatus: 'ESTIMATED',
      sampleMeanWeightG: 0,
      estimatedLiveWeightKg: 0,
      fePct: 0,
      uniformityPct: 0,
      totalWeightGainKg: 0,
      effectiveFeedKg: 0,
    };
  }

  // ADG (Average Daily Gain, g/bird/day)
  const weightGainPerBirdG = Math.max(0, sampleMeanWeightG - barn.initialWeightG);
  const adgGramsPerDay = Number((weightGainPerBirdG / days).toFixed(1));

  // Estimated live biomass = sample mean weight × remaining ducks
  const estimatedLiveWeightKg = Number(((barn.currentDucks * sampleMeanWeightG) / 1000).toFixed(1));
  const totalWeightGainKg = Number(((barn.currentDucks * weightGainPerBirdG) / 1000).toFixed(1));

  // Effective cumulative feed (kg)
  const effectiveFeedKg =
    barn.cumulativeFeedKg > 0
      ? barn.cumulativeFeedKg
      : Number((estimatedLiveWeightKg * 1.85).toFixed(1));

  // FI (Feed Intake)
  const fiGramsPerDuckPerDay =
    avgBirds > 0 ? Number(((effectiveFeedKg * 1000) / (avgBirds * days)).toFixed(1)) : 0;
  const fiCumulativeKgPerDuck =
    avgBirds > 0 ? Number((effectiveFeedKg / avgBirds).toFixed(2)) : 0;

  // Estimated FCR = Cumulative Feed / (Sample Mean Weight × Remaining Ducks)
  const fcr =
    estimatedLiveWeightKg > 0 ? Number((effectiveFeedKg / estimatedLiveWeightKg).toFixed(2)) : 0;

  // FE (Feed Efficiency = Live Weight / Feed * 100%)
  const fePct =
    effectiveFeedKg > 0 ? Number(((estimatedLiveWeightKg / effectiveFeedKg) * 100).toFixed(1)) : 0;

  // Uniformity (% within ±10% of sample mean weight)
  const uniformityPct = calculateUniformityPct(
    barn.sampleWeightsG || [],
    barn.currentAvgWeightG
  );

  return {
    adgGramsPerDay,
    fiGramsPerDuckPerDay,
    fiCumulativeKgPerDuck,
    fcr,
    fcrStatus: 'ESTIMATED',
    sampleMeanWeightG,
    estimatedLiveWeightKg,
    fePct,
    uniformityPct,
    totalWeightGainKg,
    effectiveFeedKg,
  };
}

export function calculateFarmOverviewMetrics(barns: Barn[]): BarnLivestockMetrics {
  const activeBarns = barns.filter(
    (b) => b.currentDucks > 0 && b.currentCycleDay > 0 && (b.currentAvgWeightG > 0 || (b.sampleWeightsG?.length ?? 0) > 0)
  );
  if (activeBarns.length === 0) {
    const closedBarns = barns.filter(
      (b) => b.currentDucks === 0 && typeof b.finalFcr === 'number' && b.finalFcr > 0
    );
    if (closedBarns.length > 0) {
      const avgClosedFcr =
        closedBarns.reduce((s, b) => s + (b.finalFcr || 0), 0) / closedBarns.length;
      return {
        adgGramsPerDay: 0,
        fiGramsPerDuckPerDay: 0,
        fiCumulativeKgPerDuck: 0,
        fcr: Number(avgClosedFcr.toFixed(2)),
        fcrStatus: 'FINAL',
        sampleMeanWeightG: 0,
        estimatedLiveWeightKg: 0,
        fePct: avgClosedFcr > 0 ? Number(((1 / avgClosedFcr) * 100).toFixed(1)) : 0,
        uniformityPct: 0,
        totalWeightGainKg: 0,
        effectiveFeedKg: 0,
      };
    }

    return {
      adgGramsPerDay: 0,
      fiGramsPerDuckPerDay: 0,
      fiCumulativeKgPerDuck: 0,
      fcr: 0,
      fcrStatus: 'ESTIMATED',
      sampleMeanWeightG: 0,
      estimatedLiveWeightKg: 0,
      fePct: 0,
      uniformityPct: 0,
      totalWeightGainKg: 0,
      effectiveFeedKg: 0,
    };
  }

  let totalBirds = 0;
  let weightedAdg = 0;
  let weightedFiDay = 0;
  let weightedUniformity = 0;
  let weightedSampleMean = 0;
  let totalEstimatedLiveKg = 0;
  let totalGainKg = 0;
  let totalFeedKg = 0;

  for (const barn of activeBarns) {
    const m = calculateBarnMetrics(barn);
    const weight = barn.currentDucks;
    totalBirds += weight;
    weightedAdg += m.adgGramsPerDay * weight;
    weightedFiDay += m.fiGramsPerDuckPerDay * weight;
    weightedUniformity += m.uniformityPct * weight;
    weightedSampleMean += m.sampleMeanWeightG * weight;
    totalEstimatedLiveKg += m.estimatedLiveWeightKg;
    totalGainKg += m.totalWeightGainKg;
    totalFeedKg += m.effectiveFeedKg;
  }

  const fcr =
    totalEstimatedLiveKg > 0 ? Number((totalFeedKg / totalEstimatedLiveKg).toFixed(2)) : 0;
  const fePct =
    totalFeedKg > 0 ? Number(((totalEstimatedLiveKg / totalFeedKg) * 100).toFixed(1)) : 0;

  return {
    adgGramsPerDay: Number((weightedAdg / totalBirds).toFixed(1)),
    fiGramsPerDuckPerDay: Number((weightedFiDay / totalBirds).toFixed(1)),
    fiCumulativeKgPerDuck: Number((totalFeedKg / totalBirds).toFixed(2)),
    fcr,
    fcrStatus: 'ESTIMATED',
    sampleMeanWeightG: Math.round(weightedSampleMean / totalBirds),
    estimatedLiveWeightKg: Number(totalEstimatedLiveKg.toFixed(1)),
    fePct,
    uniformityPct: Number((weightedUniformity / totalBirds).toFixed(1)),
    totalWeightGainKg: Number(totalGainKg.toFixed(1)),
    effectiveFeedKg: Number(totalFeedKg.toFixed(1)),
  };
}

export function getRecommendedRationGramsPerDuck(cycleDay: number): {
  gramsPerDuck: number;
  stage: FeedStage;
} {
  if (cycleDay <= 14) {
    return { gramsPerDuck: Math.round(25 + cycleDay * 3.5), stage: 'STARTER' };
  }
  if (cycleDay <= 35) {
    return { gramsPerDuck: Math.round(95 + (cycleDay - 14) * 5.6), stage: 'GROWER' };
  }
  return { gramsPerDuck: Math.round(215 + Math.min(15, cycleDay - 35) * 2.5), stage: 'FINISHER' };
}

export function calculateFarmDailyFeedKg(barns: Barn[]): number {
  return barns.reduce((sum, barn) => {
    if (barn.currentDucks <= 0) return sum;
    const { gramsPerDuck } = getRecommendedRationGramsPerDuck(barn.currentCycleDay);
    return sum + (barn.currentDucks * gramsPerDuck) / 1000;
  }, 0);
}

export interface BarnFeedStageAlert {
  barnId: string;
  barnName: string;
  cycleDay: number;
  expectedStage: FeedStage;
  expectedLabel: string;
  severity: 'transition' | 'mismatch' | 'no_stock' | 'ok';
  message: string;
  recommendedSiloId: string | null;
}

export function getBarnFeedStageAlert(
  barn: Barn,
  feedSilos: FeedSilo[],
  feedFormulas: FeedFormula[],
  feedLogs: FeedDispenseLog[]
): BarnFeedStageAlert {
  const expectedStage = getFeedStageForAge(barn.currentCycleDay);
  const stageMeta = FEED_STAGE_INFO[expectedStage];

  const matchingSilo =
    feedSilos.find((s) => {
      const f = feedFormulas.find((fm) => fm.id === s.formulaId);
      return f?.stage === expectedStage && s.remainingKg > 0;
    }) || null;

  const latestLog = feedLogs.find((l) => l.barnId === barn.id);
  const latestSilo = latestLog ? feedSilos.find((s) => s.id === latestLog.siloId) : null;
  const latestFormula = latestSilo
    ? feedFormulas.find((f) => f.id === latestSilo.formulaId)
    : null;

  if (barn.currentDucks <= 0) {
    return {
      barnId: barn.id,
      barnName: barn.name,
      cycleDay: barn.currentCycleDay,
      expectedStage,
      expectedLabel: `${stageMeta.labelTh} (${stageMeta.ageRangeTh})`,
      severity: 'ok',
      message: 'โรงเรือนว่าง',
      recommendedSiloId: matchingSilo?.id ?? null,
    };
  }

  if (latestFormula && latestFormula.stage !== expectedStage) {
    const prevMeta = FEED_STAGE_INFO[latestFormula.stage];
    return {
      barnId: barn.id,
      barnName: barn.name,
      cycleDay: barn.currentCycleDay,
      expectedStage,
      expectedLabel: `${stageMeta.labelTh} (${stageMeta.ageRangeTh})`,
      severity: 'mismatch',
      message: `เป็ดอายุ ${barn.currentCycleDay} วัน ถึงเวลาเปลี่ยนจาก ${prevMeta.labelTh} เป็น ${stageMeta.labelTh} (${stageMeta.ageRangeTh})`,
      recommendedSiloId: matchingSilo?.id ?? null,
    };
  }

  if (!matchingSilo) {
    return {
      barnId: barn.id,
      barnName: barn.name,
      cycleDay: barn.currentCycleDay,
      expectedStage,
      expectedLabel: `${stageMeta.labelTh} (${stageMeta.ageRangeTh})`,
      severity: 'no_stock',
      message: `เป็ดอายุ ${barn.currentCycleDay} วัน ต้องใช้ ${stageMeta.labelTh} (${stageMeta.ageRangeTh}) แต่ไม่มีสต็อกไซโลสูตรนี้`,
      recommendedSiloId: null,
    };
  }

  if (
    barn.currentCycleDay === 14 ||
    barn.currentCycleDay === 15 ||
    barn.currentCycleDay === 35 ||
    barn.currentCycleDay === 36
  ) {
    return {
      barnId: barn.id,
      barnName: barn.name,
      cycleDay: barn.currentCycleDay,
      expectedStage,
      expectedLabel: `${stageMeta.labelTh} (${stageMeta.ageRangeTh})`,
      severity: 'transition',
      message:
        barn.currentCycleDay === 14
          ? `พรุ่งนี้อายุ 15 วัน เตรียมเปลี่ยนเป็น ${FEED_STAGE_INFO.GROWER.labelTh} (${FEED_STAGE_INFO.GROWER.ageRangeTh})`
          : barn.currentCycleDay === 35
            ? `พรุ่งนี้อายุ 36 วัน เตรียมเปลี่ยนเป็น ${FEED_STAGE_INFO.FINISHER.labelTh} (${FEED_STAGE_INFO.FINISHER.ageRangeTh})`
            : `เข้าช่วงอายุ ${barn.currentCycleDay} วัน ควรเปลี่ยนเป็น ${stageMeta.labelTh} (${stageMeta.ageRangeTh})`,
      recommendedSiloId: matchingSilo.id,
    };
  }

  return {
    barnId: barn.id,
    barnName: barn.name,
    cycleDay: barn.currentCycleDay,
    expectedStage,
    expectedLabel: `${stageMeta.labelTh} (${stageMeta.ageRangeTh})`,
    severity: 'ok',
    message: `กำลังใช้ ${stageMeta.labelTh} (${stageMeta.ageRangeTh}) ตรงตามช่วงวัย`,
    recommendedSiloId: matchingSilo.id,
  };
}


