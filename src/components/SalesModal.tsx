import React, { useMemo, useState } from 'react';
import {
  X,
  Plus,
  TrendingUp,
  Award,
  AlertTriangle,
  Lock,
  Archive,
  History,
  FileText,
  FileDown,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import { ClosedBatch, FarmData, SalesRecord } from '../types/farm';
import { PixelBarChart } from './PixelCharts';
import { BatchSummaryReportModal } from './BatchSummaryReportModal';
import { exportBatchSummaryToPdf, findMatchingSaleForBatch } from '../utils/batchReportPdf';
import { exportFarmToExcel } from '../utils/farmExcelExport';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

function getFcrGradeBadge(finalFcr: number): {
  label: string;
  className: string;
} {
  if (finalFcr <= 0) {
    return {
      label: 'ไม่มีข้อมูลน้ำหนักขาย',
      className: 'bg-stone-100 text-stone-800 border-stone-500',
    };
  }
  if (finalFcr <= 2.2) {
    return {
      label: 'ดีเยี่ยม',
      className: 'bg-emerald-100 text-emerald-900 border-emerald-700',
    };
  }
  if (finalFcr <= 2.45) {
    return {
      label: 'ตามเกณฑ์',
      className: 'bg-amber-100 text-amber-900 border-amber-700',
    };
  }
  return {
    label: 'ควรปรับปรุง',
    className: 'bg-rose-100 text-rose-900 border-rose-700',
  };
}

interface SalesModalProps {
  farm: FarmData;
  onUpdateFarm: (updater: (prev: FarmData) => FarmData) => void;
  onClose: () => void;
  muted: boolean;
}

export const SalesModal: React.FC<SalesModalProps> = ({
  farm,
  onUpdateFarm,
  onClose,
  muted,
}) => {
  const initialBarn =
    farm.barns.find((b) => b.currentDucks > 0) || farm.barns[0];

  const [activeTab, setActiveTab] = useState<'SALES' | 'CLOSED_BATCHES'>('SALES');
  const [showAddForm, setShowAddForm] = useState(farm.salesRecords.length === 0);
  const [summaryModalBatch, setSummaryModalBatch] = useState<ClosedBatch | null>(null);
  const [justClosedBatch, setJustClosedBatch] = useState<ClosedBatch | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);

  const closedBatches = farm.closedBatches ?? [];

  const [barnId, setBarnId] = useState(initialBarn?.id || '');
  const [batchCode, setBatchCode] = useState(`BATCH-2026-${farm.salesRecords.length + 11}`);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [daysRaised, setDaysRaised] = useState(initialBarn?.currentCycleDay || initialBarn?.cycleDays || 45);
  const [birdsSold, setBirdsSold] = useState(initialBarn?.currentDucks ?? 0);
  const [totalWeightKg, setTotalWeightKg] = useState(
    initialBarn && initialBarn.currentDucks > 0
      ? Math.round((initialBarn.currentDucks * (initialBarn.currentAvgWeightG || 3000)) / 1000)
      : 0
  );
  const [pricingMode, setPricingMode] = useState<'PER_KG' | 'PER_BIRD'>('PER_KG');
  const [pricePerUnit, setPricePerUnit] = useState(57);

  const [ducklingCostThb, setDucklingCostThb] = useState(55000);
  const [feedCostThb, setFeedCostThb] = useState(() => {
    const cost = initialBarn
      ? farm.feedLogs.filter((l) => l.barnId === initialBarn.id).reduce((s, l) => s + l.costThb, 0)
      : 0;
    return cost > 0 ? Math.round(cost) : 140000;
  });
  const [medicineCostThb, setMedicineCostThb] = useState(11500);
  const [utilityLaborCostThb, setUtilityLaborCostThb] = useState(18000);
  const [closeBatchAfterSale, setCloseBatchAfterSale] = useState(true);

  const [carcassGradeAPct, setCarcassGradeAPct] = useState(94);
  const [buyerFeedback, setBuyerFeedback] = useState('');
  const [issuesEncountered, setIssuesEncountered] = useState('');

  const selectedBarn = useMemo(
    () => farm.barns.find((b) => b.id === barnId) || null,
    [farm.barns, barnId]
  );

  const summary = useMemo(() => {
    const totalRev = farm.salesRecords.reduce((s, r) => s + r.totalRevenueThb, 0);
    const totalProfit = farm.salesRecords.reduce((s, r) => s + r.netProfitThb, 0);
    const totalBirds = farm.salesRecords.reduce((s, r) => s + r.birdsSold, 0);
    const totalHiddenCosts = farm.salesRecords.reduce(
      (s, r) => s + (r.medicineCostThb || 0) + (r.utilityLaborCostThb || 0),
      0
    );
    const avgCostPerBird =
      farm.salesRecords.length > 0
        ? farm.salesRecords.reduce((s, r) => s + r.costPerBirdThb, 0) / farm.salesRecords.length
        : 0;
    const avgGradeA =
      farm.salesRecords.length > 0
        ? farm.salesRecords.reduce((s, r) => s + r.carcassGradeAPct, 0) / farm.salesRecords.length
        : 0;

    return { totalRev, totalProfit, totalBirds, totalHiddenCosts, avgCostPerBird, avgGradeA };
  }, [farm.salesRecords]);

  // Live preview calculations for the form
  const hiddenCostPreview = medicineCostThb + utilityLaborCostThb;
  const totalCostPreview =
    ducklingCostThb + feedCostThb + medicineCostThb + utilityLaborCostThb;
  const costPerBirdPreview = birdsSold > 0 ? totalCostPreview / birdsSold : 0;
  const totalRevenuePreview =
    pricingMode === 'PER_KG' ? totalWeightKg * pricePerUnit : birdsSold * pricePerUnit;
  const netProfitPreview = totalRevenuePreview - totalCostPreview;
  const feedKgForFcr =
    selectedBarn && selectedBarn.cumulativeFeedKg > 0
      ? selectedBarn.cumulativeFeedKg
      : feedCostThb / 15.5;
  const fcrPreview = totalWeightKg > 0 ? feedKgForFcr / totalWeightKg : 0;

  const maxDucksInBarn = selectedBarn?.currentDucks ?? 0;
  const isClosingBatch =
    maxDucksInBarn > 0 && (closeBatchAfterSale || birdsSold === maxDucksInBarn);
  const soldExceedsBarn =
    !selectedBarn || maxDucksInBarn <= 0 || birdsSold <= 0 || birdsSold > maxDucksInBarn;

  const handleBarnSelect = (nextBarnId: string) => {
    setBarnId(nextBarnId);
    const b = farm.barns.find((item) => item.id === nextBarnId);
    if (b) {
      setDaysRaised(b.currentCycleDay || b.cycleDays);
      setBirdsSold(b.currentDucks);
      setTotalWeightKg(
        b.currentDucks > 0 ? Math.round((b.currentDucks * (b.currentAvgWeightG || 3000)) / 1000) : 0
      );
      const barnFeedCost = farm.feedLogs
        .filter((l) => l.barnId === nextBarnId)
        .reduce((s, l) => s + l.costThb, 0);
      if (barnFeedCost > 0) {
        setFeedCostThb(Math.round(barnFeedCost));
      }
    }
  };

  const handleSaveSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBarn || soldExceedsBarn) return;
    playSuccessChime(muted);

    const finalFcrValue = Number(fcrPreview.toFixed(2));
    const record: SalesRecord = {
      id: `sale-${Date.now()}`,
      barnId,
      batchCode: batchCode.trim() || `BATCH-${Date.now()}`,
      saleDate,
      daysRaised,
      birdsSold,
      totalWeightKg,
      pricingMode,
      pricePerUnit,
      ducklingCostThb,
      feedCostThb,
      medicineCostThb,
      utilityLaborCostThb,
      costPerBirdThb: Number(costPerBirdPreview.toFixed(2)),
      totalRevenueThb: Math.round(totalRevenuePreview),
      netProfitThb: Math.round(netProfitPreview),
      fcr: finalFcrValue,
      fcrStatus: isClosingBatch ? 'FINAL' : 'ESTIMATED',
      carcassGradeAPct,
      carcassGradeBPct: Math.max(0, 100 - carcassGradeAPct),
      buyerFeedback: buyerFeedback.trim() || 'ซากสมบูรณ์ น้ำหนักได้มาตรฐาน',
      issuesEncountered: issuesEncountered.trim() || 'ไม่มีปัญหาสำคัญในรอบการผลิตนี้',
    };

    const cycleSalesAfter = [
      record,
      ...farm.salesRecords.filter(
        (r) => r.barnId === selectedBarn.id && r.saleDate >= selectedBarn.startDate
      ),
    ];
    const nextDucksAfterSale = Math.max(0, selectedBarn.currentDucks - birdsSold);
    const shouldArchiveClosedBatch = isClosingBatch || nextDucksAfterSale === 0;

    let createdClosedBatch: ClosedBatch | null = null;
    if (shouldArchiveClosedBatch) {
      const cycleFeedLogs = farm.feedLogs.filter(
        (l) => l.barnId === selectedBarn.id && l.date >= selectedBarn.startDate
      );
      const feedUsedFromLogs = cycleFeedLogs.reduce((s, l) => s + l.amountKg, 0);
      const totalFeedUsedKg = Math.round(
        selectedBarn.cumulativeFeedKg > 0 ? selectedBarn.cumulativeFeedKg : feedUsedFromLogs
      );
      const totalSoldDucks = cycleSalesAfter.reduce((s, r) => s + r.birdsSold, 0);
      const totalSoldWeight = cycleSalesAfter.reduce((s, r) => s + r.totalWeightKg, 0);
      const totalRev = cycleSalesAfter.reduce((s, r) => s + r.totalRevenueThb, 0);
      const totalCost = cycleSalesAfter.reduce(
        (s, r) =>
          s +
          r.ducklingCostThb +
          r.feedCostThb +
          (r.medicineCostThb || 0) +
          (r.utilityLaborCostThb || 0),
        0
      );
      const initialDucks = selectedBarn.initialDucks || totalSoldDucks;
      const survivalRatePct =
        initialDucks > 0 ? Number(((totalSoldDucks / initialDucks) * 100).toFixed(1)) : 0;
      const avgWeightPerBirdKg =
        totalSoldDucks > 0 ? Number((totalSoldWeight / totalSoldDucks).toFixed(2)) : 0;
      const closedFcr =
        totalSoldWeight > 0
          ? Number(((totalFeedUsedKg > 0 ? totalFeedUsedKg : feedKgForFcr) / totalSoldWeight).toFixed(2))
          : finalFcrValue;

      createdClosedBatch = {
        id: `cb-${Date.now()}`,
        barnId: selectedBarn.id,
        batchName: record.batchCode,
        barnName: selectedBarn.name,
        startDate: selectedBarn.startDate || saleDate,
        closedDate: saleDate,
        initialDucks,
        soldDucks: totalSoldDucks,
        survivalRatePct,
        totalSoldWeightKg: Math.round(totalSoldWeight),
        avgWeightPerBirdKg,
        totalFeedUsedKg: Math.round(totalFeedUsedKg > 0 ? totalFeedUsedKg : feedKgForFcr),
        finalFcr: closedFcr,
        totalRevenueThb: Math.round(totalRev),
        totalCostThb: Math.round(totalCost),
        netProfitThb: Math.round(totalRev - totalCost),
      };
    }

    onUpdateFarm((prev) => ({
      ...prev,
      closedBatches: createdClosedBatch
        ? [createdClosedBatch, ...(prev.closedBatches ?? [])]
        : prev.closedBatches,
      barns: prev.barns.map((b) => {
        if (b.id !== selectedBarn.id) return b;
        const nextDucks = Math.max(0, b.currentDucks - birdsSold);
        if (nextDucks === 0 && shouldArchiveClosedBatch) {
          return {
            ...b,
            initialDucks: 0,
            currentDucks: 0,
            culledDucks: 0,
            mortalityDucks: 0,
            currentAvgWeightG: 0,
            currentCycleDay: 0,
            cumulativeFeedKg: 0,
            sampleWeightsG: [],
            mortalityLogs: [],
            finalFcr: undefined,
            finalSoldWeightKg: undefined,
            status: 'CLEANING',
            cleaningChecklist: {
              muckOut: false,
              washAndScrub: false,
              disinfect: false,
              restDaysCompleted: 0,
              targetRestDays: b.cleaningChecklist?.targetRestDays || 14,
            },
          };
        }
        return {
          ...b,
          currentDucks: nextDucks,
          status: nextDucks === 0 ? 'CLEANING' : b.status,
          finalFcr: isClosingBatch ? finalFcrValue : b.finalFcr,
          finalSoldWeightKg: isClosingBatch ? totalWeightKg : b.finalSoldWeightKg,
        };
      }),
      salesRecords: [record, ...prev.salesRecords],
    }));

    if (createdClosedBatch) {
      setJustClosedBatch(createdClosedBatch);
    }
    setShowAddForm(false);
    setBuyerFeedback('');
    setIssuesEncountered('');
  };

  const handleQuickPdf = async (batch: ClosedBatch, matchedSale?: SalesRecord) => {
    playPixelClick(muted);
    setPdfBusyId(batch.id);
    try {
      await exportBatchSummaryToPdf(farm, batch, matchedSale ?? findMatchingSaleForBatch(farm, batch));
      playSuccessChime(muted);
    } finally {
      setPdfBusyId(null);
    }
  };

  const buildFallbackBatchFromSale = (rec: SalesRecord): ClosedBatch => {
    const existing = closedBatches.find(
      (cb) => cb.barnId === rec.barnId && (cb.batchName === rec.batchCode || cb.closedDate === rec.saleDate)
    );
    if (existing) return existing;
    const bName = farm.barns.find((b) => b.id === rec.barnId)?.name || rec.barnId;
    const totalCost =
      rec.ducklingCostThb +
      rec.feedCostThb +
      (rec.medicineCostThb || 0) +
      (rec.utilityLaborCostThb || 0);
    const estStart = new Date(`${rec.saleDate}T00:00:00`);
    estStart.setDate(estStart.getDate() - Math.max(1, rec.daysRaised));
    const startDate = Number.isNaN(estStart.getTime())
      ? rec.saleDate
      : estStart.toISOString().slice(0, 10);
    return {
      id: `cb-${rec.id}`,
      barnId: rec.barnId,
      batchName: rec.batchCode,
      barnName: bName,
      startDate,
      closedDate: rec.saleDate,
      initialDucks: rec.birdsSold,
      soldDucks: rec.birdsSold,
      survivalRatePct: 100,
      totalSoldWeightKg: rec.totalWeightKg,
      avgWeightPerBirdKg:
        rec.birdsSold > 0 ? Number((rec.totalWeightKg / rec.birdsSold).toFixed(2)) : 0,
      totalFeedUsedKg: Math.round(rec.fcr * rec.totalWeightKg),
      finalFcr: rec.fcr,
      totalRevenueThb: rec.totalRevenueThb,
      totalCostThb: Math.round(totalCost),
      netProfitThb: rec.netProfitThb,
    };
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="pixel-wood-panel w-full max-w-6xl max-h-[88vh] [@media(max-height:500px)]:max-h-[94vh] flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="pixel-wood-header px-3.5 sm:px-5 py-3 sm:py-3.5 [@media(max-height:500px)]:py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#fff5dc]">
              บันทึกการขาย ต้นทุนต่อตัว กำไรสุทธิ & คุณภาพซาก
            </h2>
            <p className="text-xs text-amber-200/90 tabular-nums">
              กำไรสุทธิสะสม ฿{summary.totalProfit.toLocaleString()} · ส่งขายแล้ว{' '}
              {summary.totalBirds.toLocaleString()} ตัว ({farm.salesRecords.length} รอบการผลิต)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playSuccessChime(muted);
                exportFarmToExcel(farm);
              }}
              className="pixel-btn bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              ส่งออก Excel ทั้งฟาร์ม (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                setActiveTab('SALES');
                setShowAddForm((v) => (activeTab !== 'SALES' ? true : !v));
              }}
              className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white text-xs font-bold px-3.5 py-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'SALES' && showAddForm ? 'ซ่อนฟอร์มบันทึก' : 'บันทึกรอบขายใหม่'}
            </button>
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                onClose();
              }}
              className="pixel-btn bg-[#d94a30] hover:bg-[#b93822] text-white p-2 cursor-pointer"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="bg-[#ebd2a2] border-b-2 border-[#8e4c1d] px-3.5 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                setActiveTab('SALES');
              }}
              className={`px-3.5 py-1.5 text-xs font-bold border-2 flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'SALES'
                  ? 'bg-[#4a2612] text-[#fff5dc] border-[#2b180e]'
                  : 'bg-[#fbf0d4] text-[#4a2612] border-[#8e4c1d] hover:bg-amber-100'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              บันทึกการขาย & กำไร ({farm.salesRecords.length})
            </button>
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                setActiveTab('CLOSED_BATCHES');
              }}
              className={`px-3.5 py-1.5 text-xs font-bold border-2 flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                activeTab === 'CLOSED_BATCHES'
                  ? 'bg-[#4a2612] text-[#fff5dc] border-[#2b180e]'
                  : 'bg-[#fbf0d4] text-[#4a2612] border-[#8e4c1d] hover:bg-amber-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              ประวัติรุ่นที่ปิดแล้ว ({closedBatches.length})
            </button>
          </div>
          <div className="text-[11px] text-[#5c2e14] font-semibold">
            เกณฑ์ FCR ปิดรุ่น: ≤ 2.20 ดีเยี่ยม · 2.21–2.45 ตามเกณฑ์ · &gt; 2.45 ควรปรับปรุง
          </div>
        </div>

        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-4 sm:space-y-5">
          {justClosedBatch && (
            <div className="bg-emerald-100 border-2 border-emerald-700 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-emerald-950">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <div className="font-display font-bold text-sm">
                    ปิดรุ่น &ldquo;{justClosedBatch.batchName}&rdquo; เรียบร้อยแล้ว!
                  </div>
                  <div className="tabular-nums mt-0.5">
                    อัตรารอด {justClosedBatch.survivalRatePct.toFixed(1)}% · FCR{' '}
                    {justClosedBatch.finalFcr.toFixed(2)} · กำไรสุทธิ{' '}
                    <strong>฿{justClosedBatch.netProfitThb.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playPixelClick(muted);
                    setSummaryModalBatch(justClosedBatch);
                  }}
                  className="pixel-btn bg-[#fff9eb] hover:bg-amber-100 text-[#3a1f0f] font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  ดูสรุปผลงานประจำรุ่น
                </button>
                <button
                  type="button"
                  disabled={pdfBusyId === justClosedBatch.id}
                  onClick={() => handleQuickPdf(justClosedBatch)}
                  className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-60 text-white font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  {pdfBusyId === justClosedBatch.id ? 'กำลังสร้าง PDF...' : 'เซฟเป็น PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => setJustClosedBatch(null)}
                  className="text-emerald-900 underline font-bold px-1 cursor-pointer"
                >
                  ซ่อน
                </button>
              </div>
            </div>
          )}

          {activeTab === 'SALES' ? (
            <>
              {/* Summary KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
            <div className="pixel-card p-3.5">
              <div className="text-xs text-[#723b18]">รายได้จากการขายรวม</div>
              <div className="font-mono-num text-xl font-bold text-[#3a1f0f] mt-0.5">
                ฿{summary.totalRev.toLocaleString()}
              </div>
            </div>
            <div className="pixel-card p-3.5">
              <div className="text-xs text-[#723b18]">กำไรสุทธิรวม</div>
              <div className="font-mono-num text-xl font-bold text-emerald-800 mt-0.5">
                ฿{summary.totalProfit.toLocaleString()}
              </div>
            </div>
            <div className="pixel-card p-3.5">
              <div className="text-xs text-[#723b18]">ต้นทุนเฉลี่ยต่อตัว</div>
              <div className="font-mono-num text-xl font-bold text-[#3a1f0f] mt-0.5">
                ฿{summary.avgCostPerBird.toFixed(2)}
              </div>
            </div>
            <div className="pixel-card p-3.5">
              <div className="text-xs text-[#723b18]">คุณภาพซากเกรด A เฉลี่ย</div>
              <div className="font-mono-num text-xl font-bold text-amber-800 mt-0.5">
                {summary.avgGradeA.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Add New Sale Record Form */}
          {showAddForm && (
            <form onSubmit={handleSaveSale} className="pixel-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-700" />
                <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                  บันทึกรายละเอียดหลังการขายรอบใหม่
                </h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="font-bold block mb-1">โรงเรือน</label>
                  <select
                    value={barnId}
                    onChange={(e) => handleBarnSelect(e.target.value)}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                  >
                    {farm.barns.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (คงเหลือ {b.currentDucks.toLocaleString()} ตัว)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">รหัสรอบการผลิต</label>
                  <input
                    type="text"
                    required
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">วันที่ขาย</label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">จำนวนวันที่เลี้ยง (วัน)</label>
                  <input
                    type="number"
                    min={1}
                    value={daysRaised}
                    onChange={(e) => setDaysRaised(Number(e.target.value))}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                  />
                </div>

                <div>
                  <label className="font-bold block mb-1">
                    จำนวนเป็ดที่ขายได้ (ตัว) · สูงสุด {maxDucksInBarn.toLocaleString()}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={maxDucksInBarn}
                    value={birdsSold}
                    onChange={(e) => setBirdsSold(Math.max(0, Number(e.target.value)))}
                    className={`w-full bg-white border-2 px-2.5 py-1.5 font-mono-num ${
                      birdsSold > maxDucksInBarn || maxDucksInBarn <= 0
                        ? 'border-red-700 bg-red-50 text-red-900 font-bold'
                        : 'border-[#723b18]'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">น้ำหนักเป็ดมีชีวิตรวม (กก.)</label>
                  <input
                    type="number"
                    min={1}
                    value={totalWeightKg}
                    onChange={(e) => setTotalWeightKg(Number(e.target.value))}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">วิธีคิดราคาขาย</label>
                  <select
                    value={pricingMode}
                    onChange={(e) => setPricingMode(e.target.value as 'PER_KG' | 'PER_BIRD')}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                  >
                    <option value="PER_KG">บาท / กิโลกรัม</option>
                    <option value="PER_BIRD">บาท / ตัว</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">
                    ราคาต่อหน่วย ({pricingMode === 'PER_KG' ? '฿/กก.' : '฿/ตัว'})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    value={pricePerUnit}
                    onChange={(e) => setPricePerUnit(Number(e.target.value))}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                  />
                </div>
              </div>

              {maxDucksInBarn <= 0 && (
                <div className="bg-amber-100 border-2 border-amber-700 p-2.5 text-xs font-bold text-amber-950 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                  <span>โรงเรือนนี้ไม่มีเป็ดคงเหลือสำหรับบันทึกการขาย กรุณาเลือกโรงเรือนที่มีเป็ด</span>
                </div>
              )}

              {maxDucksInBarn > 0 && birdsSold > maxDucksInBarn && (
                <div className="bg-red-100 border-2 border-red-700 p-2.5 text-xs font-bold text-red-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                  <span>
                    ล็อกยอดขาย: ห้ามบันทึกยอดขายเกินจำนวนเป็ดที่มีอยู่ในโรงเรือน (
                    {maxDucksInBarn.toLocaleString()} ตัว)
                  </span>
                </div>
              )}

              {/* Direct Costs + Hidden Costs Section */}
              <div className="border-t border-[#e5cfa2] pt-3 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold block mb-1">ค่าลูกเป็ด (บาท)</label>
                    <input
                      type="number"
                      min={0}
                      value={ducklingCostThb}
                      onChange={(e) => setDucklingCostThb(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">ค่าอาหารรวม (บาท)</label>
                    <input
                      type="number"
                      min={0}
                      value={feedCostThb}
                      onChange={(e) => setFeedCostThb(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">สัดส่วนซากเกรด A (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={carcassGradeAPct}
                      onChange={(e) =>
                        setCarcassGradeAPct(Math.min(100, Math.max(0, Number(e.target.value))))
                      }
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                    />
                  </div>
                </div>

                {/* Hidden Costs Highlight Box (Req 4) */}
                <div className="bg-[#fff9eb] border-2 border-[#8e4c1d] p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display font-bold text-xs text-[#4a2612]">
                      ต้นทุนแฝงต่อรุ่น (Hidden Costs — หักออกจากกำไรสุทธิจริง)
                    </span>
                    <span className="font-mono-num text-xs font-bold text-rose-800">
                      รวมต้นทุนแฝง ฿{hiddenCostPreview.toLocaleString()} (฿
                      {birdsSold > 0 ? (hiddenCostPreview / birdsSold).toFixed(2) : '0.00'}/ตัว)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold block mb-1 text-[#4a2612]">
                        ค่ายา / วัคซีน ต่อรุ่น (บาท)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={medicineCostThb}
                        onChange={(e) => setMedicineCostThb(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1 text-[#4a2612]">
                        ค่าแก๊สกก / ค่าไฟ / ค่าแรง ต่อรุ่น (บาท)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={utilityLaborCostThb}
                        onChange={(e) =>
                          setUtilityLaborCostThb(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-bold block mb-1">
                    Feedback เรื่องคุณภาพซาก (จากโรงเชือด/ลูกค้า)
                  </label>
                  <textarea
                    rows={2}
                    value={buyerFeedback}
                    onChange={(e) => setBuyerFeedback(e.target.value)}
                    placeholder="เช่น เนื้อแน่น ไขมันพอดี มีรอยช้ำน้อย ขนหลุดสะอาด..."
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">ปัญหาที่เจอในรอบการผลิตนี้</label>
                  <textarea
                    rows={2}
                    value={issuesEncountered}
                    onChange={(e) => setIssuesEncountered(e.target.value)}
                    placeholder="เช่น แอมโมเนียสูงช่วงสัปดาห์ที่ 4, พื้นแฉะ, อากาศร้อน..."
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-[#3a1f0f] bg-[#f3e1b9] px-3 py-2 border border-[#c68443] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isClosingBatch}
                  disabled={birdsSold === maxDucksInBarn && maxDucksInBarn > 0}
                  onChange={(e) => setCloseBatchAfterSale(e.target.checked)}
                  className="accent-[#4ea832]"
                />
                <Lock className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                <span>
                  ปิดรุ่นหลังการขายนี้ (ล็อกค่า FCR ปิดรุ่นจากน้ำหนักขายจริง {totalWeightKg.toLocaleString()} กก.)
                </span>
              </label>

              {/* Live Calculation Preview Banner */}
              <div className="bg-[#f3e1b9] border-2 border-[#723b18] p-3 flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
                <div className="flex flex-wrap gap-4">
                  <span>
                    ต้นทุนจริง/ตัว: <strong className="font-mono-num">฿{costPerBirdPreview.toFixed(2)}</strong>
                  </span>
                  <span>
                    รายได้รวม: <strong className="font-mono-num">฿{Math.round(totalRevenuePreview).toLocaleString()}</strong>
                  </span>
                  <span>
                    กำไรสุทธิ:{' '}
                    <strong
                      className={`font-mono-num ${
                        netProfitPreview >= 0 ? 'text-emerald-800' : 'text-rose-700'
                      }`}
                    >
                      ฿{Math.round(netProfitPreview).toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    {isClosingBatch ? 'FCR ปิดรุ่น (ล็อกจริง):' : 'FCR คาดการณ์:'}{' '}
                    <strong className="font-mono-num">{fcrPreview.toFixed(2)}</strong>
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={soldExceedsBarn}
                  className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2 cursor-pointer"
                >
                  บันทึกรอบขาย
                </button>
              </div>
            </form>
          )}

          {/* Profit vs Cost Chart */}
          {farm.salesRecords.length > 0 && (
            <div className="pixel-card p-4">
              <h3 className="font-display font-bold text-base text-[#3a1f0f] mb-1">
                กราฟเปรียบเทียบรายได้ (เขียว) และกำไรสุทธิ (ทอง) แต่ละรอบการผลิต
              </h3>
              <PixelBarChart
                items={farm.salesRecords.map((r) => ({
                  label: r.batchCode,
                  value: r.totalRevenueThb,
                  secondaryValue: Math.max(0, r.netProfitThb),
                  color: '#22c55e',
                  secondaryColor: '#eab308',
                }))}
                unit="฿"
                height={170}
              />
            </div>
          )}

          {/* Sales History Cards */}
          <div className="space-y-3">
            <h3 className="font-display font-bold text-base text-[#3a1f0f]">
              ประวัติสรุปรอบการขายและ Feedback คุณภาพซาก ({farm.salesRecords.length})
            </h3>
            {farm.salesRecords.length === 0 ? (
              <div className="pixel-card p-6 text-center text-sm text-[#723b18]">
                ยังไม่มีประวัติการขายในฟาร์มนี้ กด &ldquo;บันทึกรอบขายใหม่&rdquo; ด้านบนเพื่อบันทึกข้อมูล
              </div>
            ) : (
              farm.salesRecords.map((rec) => {
                const bName = farm.barns.find((b) => b.id === rec.barnId)?.name || rec.barnId;
                return (
                  <div key={rec.id} className="pixel-card p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5cfa2] pb-2">
                      <div>
                        <span className="font-display font-bold text-base text-[#3a1f0f] mr-2">
                          {rec.batchCode}
                        </span>
                        <span className="text-xs text-[#723b18]">
                          {bName} · ขายวันที่ <span className="font-mono-num">{rec.saleDate}</span> · เลี้ยง{' '}
                          {rec.daysRaised} วัน
                        </span>
                      </div>
                      <div className="font-mono-num text-sm font-bold text-emerald-800">
                        กำไรสุทธิ ฿{rec.netProfitThb.toLocaleString()}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs tabular-nums">
                      <div>
                        <div className="text-[#723b18]">เป็ดที่ขายได้</div>
                        <div className="font-mono-num font-bold">
                          {rec.birdsSold.toLocaleString()} ตัว ({rec.totalWeightKg.toLocaleString()} กก.)
                        </div>
                      </div>
                      <div>
                        <div className="text-[#723b18]">ราคาต่อหน่วย</div>
                        <div className="font-mono-num font-bold">
                          ฿{rec.pricePerUnit} / {rec.pricingMode === 'PER_KG' ? 'กก.' : 'ตัว'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#723b18]">ต้นทุนต่อตัว</div>
                        <div className="font-mono-num font-bold">฿{rec.costPerBirdThb.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[#723b18]">
                          {rec.fcrStatus === 'ESTIMATED' ? 'FCR คาดการณ์' : 'FCR ปิดรุ่น (ล็อกจริง)'}
                        </div>
                        <div className="font-mono-num font-bold text-emerald-800">
                          {rec.fcr.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#723b18]">คุณภาพซาก</div>
                        <div className="font-mono-num font-bold flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-amber-600" />
                          เกรด A {rec.carcassGradeAPct}% / เกรด B {rec.carcassGradeBPct}%
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#f3e1b9]/80 border border-[#c68443] px-3 py-2 text-[11px] flex flex-wrap gap-x-4 gap-y-1 tabular-nums text-[#4a2612]">
                      <span>
                        ค่าลูกเป็ด: <strong className="font-mono-num">฿{rec.ducklingCostThb.toLocaleString()}</strong>
                      </span>
                      <span>
                        ค่าอาหาร: <strong className="font-mono-num">฿{rec.feedCostThb.toLocaleString()}</strong>
                      </span>
                      <span>
                        ค่ายา/วัคซีน:{' '}
                        <strong className="font-mono-num text-rose-800">
                          ฿{(rec.medicineCostThb || 0).toLocaleString()}
                        </strong>
                      </span>
                      <span>
                        ค่าแก๊สกก/ไฟ/แรงงาน:{' '}
                        <strong className="font-mono-num text-rose-800">
                          ฿{(rec.utilityLaborCostThb || 0).toLocaleString()}
                        </strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#fff9eb] p-3 border border-[#c68443]">
                      <div>
                        <div className="font-bold text-[#4a2612] mb-0.5">Feedback คุณภาพซาก:</div>
                        <p className="text-[#3a1f0f]">{rec.buyerFeedback}</p>
                      </div>
                      <div>
                        <div className="font-bold text-rose-900 mb-0.5">ปัญหาที่พบในรอบผลิต:</div>
                        <p className="text-[#3a1f0f]">{rec.issuesEncountered}</p>
                      </div>
                    </div>

                    {rec.fcrStatus !== 'ESTIMATED' && (() => {
                      const batchForSale = buildFallbackBatchFromSale(rec);
                      return (
                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              playPixelClick(muted);
                              setSummaryModalBatch(batchForSale);
                            }}
                            className="pixel-btn bg-[#fff9eb] hover:bg-amber-100 text-[#3a1f0f] text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            ดูสรุปผลงานประจำรุ่น
                          </button>
                          <button
                            type="button"
                            disabled={pdfBusyId === batchForSale.id}
                            onClick={() => handleQuickPdf(batchForSale, rec)}
                            className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            {pdfBusyId === batchForSale.id ? 'กำลังสร้าง PDF...' : 'เซฟเป็น PDF'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })
            )}
          </div>
            </>
          ) : (
            /* CLOSED BATCHES HISTORY TAB */
            <div className="space-y-5">
              {/* Closed Batches Summary KPI */}
              {(() => {
                const totalClosedProfit = closedBatches.reduce((s, b) => s + b.netProfitThb, 0);
                const avgSurvival =
                  closedBatches.length > 0
                    ? closedBatches.reduce((s, b) => s + b.survivalRatePct, 0) / closedBatches.length
                    : 0;
                const validFcrBatches = closedBatches.filter((b) => b.finalFcr > 0);
                const avgFcr =
                  validFcrBatches.length > 0
                    ? validFcrBatches.reduce((s, b) => s + b.finalFcr, 0) / validFcrBatches.length
                    : 0;
                const avgFcrGrade = getFcrGradeBadge(avgFcr);

                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
                    <div className="pixel-card p-3.5">
                      <div className="text-xs text-[#723b18]">จำนวนรุ่นที่ปิดแล้ว</div>
                      <div className="font-mono-num text-xl font-bold text-[#3a1f0f] mt-0.5">
                        {closedBatches.length} รุ่น
                      </div>
                    </div>
                    <div className="pixel-card p-3.5">
                      <div className="text-xs text-[#723b18]">อัตราการรอดเฉลี่ย</div>
                      <div className="font-mono-num text-xl font-bold text-emerald-800 mt-0.5">
                        {avgSurvival.toFixed(1)}%
                      </div>
                    </div>
                    <div className="pixel-card p-3.5">
                      <div className="text-xs text-[#723b18] flex items-center justify-between gap-1">
                        <span>FCR ปิดรุ่นเฉลี่ย</span>
                        {validFcrBatches.length > 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${avgFcrGrade.className}`}>
                            {avgFcrGrade.label}
                          </span>
                        )}
                      </div>
                      <div className="font-mono-num text-xl font-bold text-[#3a1f0f] mt-0.5">
                        {avgFcr.toFixed(2)}
                      </div>
                    </div>
                    <div className="pixel-card p-3.5">
                      <div className="text-xs text-[#723b18]">กำไรสุทธิสะสม (รุ่นที่ปิด)</div>
                      <div
                        className={`font-mono-num text-xl font-bold mt-0.5 ${
                          totalClosedProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        ฿{totalClosedProfit.toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {closedBatches.length === 0 ? (
                <div className="pixel-card p-8 text-center space-y-2">
                  <Archive className="w-8 h-8 text-[#8e4c1d] mx-auto" />
                  <div className="font-display font-bold text-base text-[#3a1f0f]">
                    ยังไม่มีประวัติรุ่นที่ปิดแล้ว
                  </div>
                  <p className="text-xs text-[#723b18]">
                    เปิดหน้าต่างโรงเรือน แล้วกดปุ่ม &ldquo;ปิดรุ่น &amp; พักเล้า&rdquo; เพื่อสรุปผลการเลี้ยงเข้าสู่ประวัติรุ่น
                  </p>
                </div>
              ) : (
                <>
                  {/* Cards View */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {closedBatches.map((cb) => {
                      const grade = getFcrGradeBadge(cb.finalFcr);
                      return (
                        <div key={cb.id} className="pixel-card p-4 space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e5cfa2] pb-2.5">
                            <div>
                              <div className="font-display font-bold text-base text-[#3a1f0f]">
                                {cb.batchName}
                              </div>
                              <div className="text-xs text-[#723b18]">
                                {cb.barnName} ·{' '}
                                <span className="font-mono-num">
                                  {cb.startDate} → {cb.closedDate}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-xs font-bold px-2.5 py-1 border-2 whitespace-nowrap ${grade.className}`}
                            >
                              FCR {cb.finalFcr.toFixed(2)} · {grade.label}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs bg-[#f3e1b9] p-3 border border-[#c68443] tabular-nums">
                            <div>
                              <div className="text-[#723b18]">อัตราการรอด</div>
                              <div className="font-mono-num font-bold text-emerald-900 text-sm">
                                {cb.survivalRatePct.toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-[#5c2e14]">
                                {cb.soldDucks.toLocaleString()} / {cb.initialDucks.toLocaleString()} ตัว
                              </div>
                            </div>
                            <div>
                              <div className="text-[#723b18]">น้ำหนักเฉลี่ย</div>
                              <div className="font-mono-num font-bold text-[#3a1f0f] text-sm">
                                {cb.avgWeightPerBirdKg.toFixed(2)} กก./ตัว
                              </div>
                              <div className="text-[10px] text-[#5c2e14]">
                                ขายรวม {cb.totalSoldWeightKg.toLocaleString()} กก.
                              </div>
                            </div>
                            <div>
                              <div className="text-[#723b18]">อาหารที่ใช้รวม</div>
                              <div className="font-mono-num font-bold text-[#3a1f0f] text-sm">
                                {cb.totalFeedUsedKg.toLocaleString()} กก.
                              </div>
                              <div className="text-[10px] text-[#5c2e14]">FCR ปิดรุ่นจริง</div>
                            </div>
                            <div>
                              <div className="text-[#723b18]">กำไรสุทธิ</div>
                              <div
                                className={`font-mono-num font-bold text-sm ${
                                  cb.netProfitThb >= 0 ? 'text-emerald-800' : 'text-rose-800'
                                }`}
                              >
                                ฿{cb.netProfitThb.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-[#5c2e14]">
                                รายได้ ฿{cb.totalRevenueThb.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5c2e14] bg-[#fff9eb] px-3 py-1.5 border border-[#d6b680] tabular-nums">
                            <span>
                              ต้นทุน/กก.:{' '}
                              <strong className="font-mono-num">
                                ฿{cb.totalSoldWeightKg > 0 ? (cb.totalCostThb / cb.totalSoldWeightKg).toFixed(2) : '0.00'}
                              </strong>
                            </span>
                            <span>
                              ต้นทุนรวม: <strong className="font-mono-num">฿{cb.totalCostThb.toLocaleString()}</strong>
                            </span>
                            <span>
                              กำไร/ตัว:{' '}
                              <strong className="font-mono-num">
                                ฿{cb.soldDucks > 0 ? (cb.netProfitThb / cb.soldDucks).toFixed(2) : '0.00'}
                              </strong>
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                playPixelClick(muted);
                                setSummaryModalBatch(cb);
                              }}
                              className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              สรุปผลงานประจำรุ่น
                            </button>
                            <button
                              type="button"
                              disabled={pdfBusyId === cb.id}
                              onClick={() => handleQuickPdf(cb)}
                              className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              {pdfBusyId === cb.id ? 'กำลังสร้าง PDF...' : 'เซฟเป็น PDF'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact Summary Table */}
                  <div className="pixel-card p-4 space-y-2">
                    <h3 className="font-display font-bold text-sm text-[#3a1f0f]">
                      ตารางเปรียบเทียบผลประกอบการรุ่นที่ปิดแล้ว
                    </h3>
                    <div className="overflow-x-auto border-2 border-[#723b18] bg-white">
                      <table className="w-full min-w-[720px] text-xs border-collapse tabular-nums">
                        <thead>
                          <tr className="bg-[#ebd2a2] text-[#3a1f0f] text-left">
                            <th className="border border-[#d6b680] px-2.5 py-2">ชื่อรุ่น / โรงเรือน</th>
                            <th className="border border-[#d6b680] px-2.5 py-2">เข้า → ออก</th>
                            <th className="border border-[#d6b680] px-2.5 py-2 text-right">อัตรารอด</th>
                            <th className="border border-[#d6b680] px-2.5 py-2 text-right">นน.เฉลี่ย</th>
                            <th className="border border-[#d6b680] px-2.5 py-2 text-right">ต้นทุน/กก.</th>
                            <th className="border border-[#d6b680] px-2.5 py-2 text-center">FCR ปิดรุ่น</th>
                            <th className="border border-[#d6b680] px-2.5 py-2 text-right">กำไรสุทธิ</th>
                            <th className="border border-[#d6b680] px-2.5 py-2 text-center">สรุปผลงานประจำรุ่น / PDF</th>
                          </tr>
                        </thead>
                        <tbody>
                          {closedBatches.map((cb) => {
                            const grade = getFcrGradeBadge(cb.finalFcr);
                            const costPerKg =
                              cb.totalSoldWeightKg > 0 ? cb.totalCostThb / cb.totalSoldWeightKg : 0;
                            return (
                              <tr key={cb.id} className="hover:bg-amber-50">
                                <td className="border border-[#d6b680] px-2.5 py-2">
                                  <div className="font-bold text-[#3a1f0f]">{cb.batchName}</div>
                                  <div className="text-[11px] text-[#723b18]">{cb.barnName}</div>
                                </td>
                                <td className="border border-[#d6b680] px-2.5 py-2 font-mono-num whitespace-nowrap">
                                  {cb.startDate} → {cb.closedDate}
                                </td>
                                <td className="border border-[#d6b680] px-2.5 py-2 text-right font-mono-num font-bold text-emerald-800">
                                  {cb.survivalRatePct.toFixed(1)}%
                                </td>
                                <td className="border border-[#d6b680] px-2.5 py-2 text-right font-mono-num">
                                  {cb.avgWeightPerBirdKg.toFixed(2)} กก.
                                </td>
                                <td className="border border-[#d6b680] px-2.5 py-2 text-right font-mono-num">
                                  ฿{costPerKg.toFixed(2)}
                                </td>
                                <td className="border border-[#d6b680] px-2.5 py-2 text-center">
                                  <span
                                    className={`inline-block text-[11px] font-bold px-2 py-0.5 border font-mono-num ${grade.className}`}
                                  >
                                    {cb.finalFcr.toFixed(2)} · {grade.label}
                                  </span>
                                </td>
                                <td
                                  className={`border border-[#d6b680] px-2.5 py-2 text-right font-mono-num font-bold ${
                                    cb.netProfitThb >= 0 ? 'text-emerald-800' : 'text-rose-800'
                                  }`}
                                >
                                  ฿{cb.netProfitThb.toLocaleString()}
                                </td>
                                <td className="border border-[#d6b680] px-2.5 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        playPixelClick(muted);
                                        setSummaryModalBatch(cb);
                                      }}
                                      className="px-2 py-1 bg-[#fbf0d4] hover:bg-amber-200 border border-[#723b18] text-[#3a1f0f] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                    >
                                      <FileText className="w-3 h-3" />
                                      ดูสรุป
                                    </button>
                                    <button
                                      type="button"
                                      disabled={pdfBusyId === cb.id}
                                      onClick={() => handleQuickPdf(cb)}
                                      className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 border border-emerald-700 text-emerald-950 font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                    >
                                      <FileDown className="w-3 h-3" />
                                      PDF
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {summaryModalBatch && (
        <BatchSummaryReportModal
          farm={farm}
          batch={summaryModalBatch}
          onClose={() => setSummaryModalBatch(null)}
          muted={muted}
        />
      )}
    </div>
  );
};
