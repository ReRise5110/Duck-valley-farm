import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Calendar as CalendarIcon,
  BarChart3,
  Plus,
  ChevronLeft,
  ChevronRight,
  Bell,
  Download,
  AlertTriangle,
  Archive,
  FileText,
  FileDown,
  Trash2,
  Scale,
  Check,
} from 'lucide-react';
import {
  Barn,
  BarnStatus,
  CalendarCategory,
  CalendarEvent,
  ClosedBatch,
  FarmData,
  PixelStickerType,
  WeightLogEntry,
} from '../types/farm';
import { PixelBarChart, PixelDonutChart } from './PixelCharts';
import { PixelSticker } from './PixelSprites';
import { BatchSummaryReportModal } from './BatchSummaryReportModal';
import { exportBatchSummaryToPdf, findMatchingSaleForBatch } from '../utils/batchReportPdf';
import {
  createGoogleCalendarEvent,
  downloadCalendarIcs,
  sendLineFarmNotification,
} from '../services/googleSync';
import {
  calculateBarnMetrics,
  calculateFarmOverviewMetrics,
  calculateUniformityPct,
  FEED_STAGE_INFO,
  getBarnFeedStageAlert,
  getFeedStageForAge,
} from '../utils/livestockMetrics';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

interface BarnModalProps {
  farm: FarmData;
  onUpdateFarm: (updater: (prev: FarmData) => FarmData) => void;
  onClose: () => void;
  accessToken: string | null;
  muted: boolean;
}

const STATUS_LABELS: Record<BarnStatus, { th: string; color: string }> = {
  ACTIVE: { th: 'กำลังเลี้ยง', color: 'bg-emerald-100 text-emerald-900 border-emerald-700' },
  CLEANING: { th: 'ทำความสะอาด', color: 'bg-sky-100 text-sky-900 border-sky-700' },
  DISINFECTING: { th: 'พ่นยาฆ่าเชื้อ', color: 'bg-amber-100 text-amber-900 border-amber-700' },
  RESTING: { th: 'พักโรงเรือน', color: 'bg-stone-200 text-stone-900 border-stone-600' },
  READY: { th: 'รอเป็ดเข้าใหม่', color: 'bg-lime-100 text-lime-900 border-lime-700' },
};

const CATEGORY_OPTIONS: Array<{
  id: CalendarCategory;
  label: string;
  sticker: PixelStickerType;
}> = [
  { id: 'PLACEMENT', label: 'รับเป็ดเข้า', sticker: 'duckling' },
  { id: 'VACCINE', label: 'ฉีดวัคซีน', sticker: 'syringe' },
  { id: 'HEALTH', label: 'ตรวจสุขภาพ', sticker: 'heart' },
  { id: 'HARVEST', label: 'กำหนดส่งขาย', sticker: 'crate' },
  { id: 'CLEANING', label: 'ล้าง/พักโรงเรือน', sticker: 'broom' },
  { id: 'CUSTOM', label: 'กิจกรรมอื่นๆ', sticker: 'star' },
];

const STICKER_LIST: Array<{ id: PixelStickerType; label: string }> = [
  { id: 'duckling', label: 'ลูกเป็ด' },
  { id: 'syringe', label: 'วัคซีน' },
  { id: 'heart', label: 'ตรวจสุขภาพ' },
  { id: 'crate', label: 'ส่งขาย' },
  { id: 'broom', label: 'ทำความสะอาด' },
  { id: 'star', label: 'หมายเหตุพิเศษ' },
];

export const BarnModal: React.FC<BarnModalProps> = ({
  farm,
  onUpdateFarm,
  onClose,
  accessToken,
  muted,
}) => {
  const [selectedBarnId, setSelectedBarnId] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'METRICS' | 'CALENDAR'>('METRICS');

  // Mortality/cull logger form
  const [logType, setLogType] = useState<'MORTALITY' | 'CULL'>('MORTALITY');
  const [logCount, setLogCount] = useState<number>(2);
  const [logReason, setLogReason] = useState<string>('');

  // New duck placement form (when barn is READY/RESTING)
  const [placeCount, setPlaceCount] = useState<number>(1500);
  const [placeWeightG, setPlaceWeightG] = useState<number>(53);
  const [placeBreed, setPlaceBreed] = useState<string>('Cherry Valley SM3');

  // Calendar state
  const [calMonthDate, setCalMonthDate] = useState(() => new Date(2026, 10, 1)); // Nov 2026
  const [newEventDate, setNewEventDate] = useState('2026-11-16');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCategory, setNewEventCategory] = useState<CalendarCategory>('VACCINE');
  const [newEventSticker, setNewEventSticker] = useState<PixelStickerType>('syringe');
  const [newEventGCal, setNewEventGCal] = useState(true);
  const [newEventLine, setNewEventLine] = useState(true);
  const [newEventNotes, setNewEventNotes] = useState('');
  const [notifyToast, setNotifyToast] = useState<string | null>(null);

  // Close Batch modal state
  const [closingBarn, setClosingBarn] = useState<Barn | null>(null);
  const [closeBatchName, setCloseBatchName] = useState('');
  const [closeClosedDate, setCloseClosedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [closeSoldDucks, setCloseSoldDucks] = useState(0);
  const [closeTotalSoldWeightKg, setCloseTotalSoldWeightKg] = useState(0);
  const [closeTotalFeedUsedKg, setCloseTotalFeedUsedKg] = useState(0);
  const [closeTotalRevenueThb, setCloseTotalRevenueThb] = useState(0);
  const [closeTotalCostThb, setCloseTotalCostThb] = useState(0);
  const [closeHasMatchedSales, setCloseHasMatchedSales] = useState(false);
  const [lastClosedBatch, setLastClosedBatch] = useState<ClosedBatch | null>(null);
  const [summaryModalBatch, setSummaryModalBatch] = useState<ClosedBatch | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [confirmDeleteBarnId, setConfirmDeleteBarnId] = useState<string | null>(null);

  const selectedBarn = useMemo(
    () => farm.barns.find((b) => b.id === selectedBarnId) || null,
    [farm.barns, selectedBarnId]
  );

  const [sampleWeightsText, setSampleWeightsText] = useState<string>('');
  const [sampleWeightsFocused, setSampleWeightsFocused] = useState(false);
  const [avgWeightText, setAvgWeightText] = useState<string>('');
  const [avgWeightFocused, setAvgWeightFocused] = useState(false);
  const [barnBottomTab, setBarnBottomTab] = useState<'WEIGHT_HISTORY' | 'MORTALITY_HISTORY'>(
    'WEIGHT_HISTORY'
  );

  useEffect(() => {
    if (!selectedBarn) {
      setSampleWeightsText('');
      setAvgWeightText('');
      return;
    }
    if (!sampleWeightsFocused) {
      setSampleWeightsText((selectedBarn.sampleWeightsG || []).join(', '));
    }
    if (!avgWeightFocused) {
      setAvgWeightText(String(selectedBarn.currentAvgWeightG ?? 0));
    }
  }, [
    selectedBarn?.id,
    selectedBarn?.sampleWeightsG,
    selectedBarn?.currentAvgWeightG,
    sampleWeightsFocused,
    avgWeightFocused,
  ]);

  const totalStats = useMemo(() => {
    return farm.barns.reduce(
      (acc, b) => {
        acc.initial += b.initialDucks;
        acc.current += b.currentDucks;
        acc.culled += b.culledDucks;
        acc.mortality += b.mortalityDucks;
        acc.area += b.areaSqm;
        return acc;
      },
      { initial: 0, current: 0, culled: 0, mortality: 0, area: 0 }
    );
  }, [farm.barns]);

  const showToast = (msg: string) => {
    setNotifyToast(msg);
    window.setTimeout(() => setNotifyToast(null), 4000);
  };

  const handleLogLoss = (barn: Barn) => {
    if (logCount <= 0 || logCount > barn.currentDucks) return;
    playPixelClick(muted);
    const today = new Date().toISOString().slice(0, 10);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) => {
        if (b.id !== barn.id) return b;
        const nextCurrent = Math.max(0, b.currentDucks - logCount);
        return {
          ...b,
          currentDucks: nextCurrent,
          culledDucks: logType === 'CULL' ? b.culledDucks + logCount : b.culledDucks,
          mortalityDucks: logType === 'MORTALITY' ? b.mortalityDucks + logCount : b.mortalityDucks,
          mortalityLogs: [
            {
              id: `ml-${Date.now()}`,
              date: today,
              type: logType,
              count: logCount,
              reason: logReason.trim() || (logType === 'CULL' ? 'คัดแยกเป็ดไม่สมบูรณ์' : 'ตายในเล้า'),
            },
            ...b.mortalityLogs,
          ],
        };
      }),
    }));
    setLogReason('');
    showToast(`หักจำนวนเป็ด ${logCount} ตัว ออกจาก ${barn.name} แล้ว`);
  };

  const handleUpdateBarnField = (barnId: string, patch: Partial<Barn>) => {
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) => (b.id === barnId ? { ...b, ...patch } : b)),
    }));
  };

  const handleRecordSampleWeights = (barn: Barn) => {
    const parsed = sampleWeightsText
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsed.length === 0) return;

    const avgWeightG = Math.round(parsed.reduce((sum, n) => sum + n, 0) / parsed.length);
    const uniformityPct = calculateUniformityPct(parsed, avgWeightG);
    const adgGramsPerDay =
      barn.currentCycleDay > 0
        ? Number((Math.max(0, avgWeightG - barn.initialWeightG) / barn.currentCycleDay).toFixed(1))
        : 0;
    const now = new Date();
    const entry: WeightLogEntry = {
      id: `wl-${Date.now()}`,
      date: now.toISOString().slice(0, 10),
      timestamp: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      cycleDay: barn.currentCycleDay,
      weightsG: parsed,
      avgWeightG,
      adgGramsPerDay,
      uniformityPct,
      note: `สุ่มชั่งน้ำหนัก ${parsed.length} ตัว`,
    };

    playSuccessChime(muted);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) =>
        b.id === barn.id
          ? {
              ...b,
              sampleWeightsG: parsed,
              currentAvgWeightG: avgWeightG,
              weightLogs: [entry, ...(b.weightLogs || [])],
            }
          : b
      ),
    }));
    setSampleWeightsText(parsed.join(', '));
    setAvgWeightText(String(avgWeightG));
    setBarnBottomTab('WEIGHT_HISTORY');
    showToast(
      `บันทึกประวัติน้ำหนัก ${barn.name} (${parsed.length} ตัว · เฉลี่ย ${avgWeightG.toLocaleString()} ก. · ADG ${adgGramsPerDay.toFixed(1)} ก./วัน) เรียบร้อย`
    );
  };

  const handleRecordAvgWeight = (barn: Barn) => {
    const numeric = Number(avgWeightText.replace(/,/g, '').trim());
    if (!Number.isFinite(numeric) || numeric <= 0) return;

    const avgWeightG = Math.round(numeric);
    const uniformityPct = calculateUniformityPct(barn.sampleWeightsG || [], avgWeightG);
    const adgGramsPerDay =
      barn.currentCycleDay > 0
        ? Number((Math.max(0, avgWeightG - barn.initialWeightG) / barn.currentCycleDay).toFixed(1))
        : 0;
    const now = new Date();
    const entry: WeightLogEntry = {
      id: `wl-${Date.now()}`,
      date: now.toISOString().slice(0, 10),
      timestamp: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      cycleDay: barn.currentCycleDay,
      weightsG: [avgWeightG],
      avgWeightG,
      adgGramsPerDay,
      uniformityPct,
      note: 'บันทึกน้ำหนักเฉลี่ยปัจจุบัน',
    };

    playSuccessChime(muted);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) =>
        b.id === barn.id
          ? {
              ...b,
              currentAvgWeightG: avgWeightG,
              weightLogs: [entry, ...(b.weightLogs || [])],
            }
          : b
      ),
    }));
    setAvgWeightText(String(avgWeightG));
    setBarnBottomTab('WEIGHT_HISTORY');
    showToast(
      `บันทึกน้ำหนักเฉลี่ย ${barn.name} (${avgWeightG.toLocaleString()} ก. · ADG ${adgGramsPerDay.toFixed(1)} ก./วัน) ลงประวัติแล้ว`
    );
  };

  const handleDeleteWeightLog = (barnId: string, logId: string) => {
    playPixelClick(muted);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) =>
        b.id === barnId
          ? { ...b, weightLogs: (b.weightLogs || []).filter((w) => w.id !== logId) }
          : b
      ),
    }));
  };

  const handleStartNewBatch = (barn: Barn) => {
    playSuccessChime(muted);
    const today = new Date().toISOString().slice(0, 10);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) =>
        b.id === barn.id
          ? {
              ...b,
              breed: placeBreed,
              initialDucks: placeCount,
              currentDucks: placeCount,
              culledDucks: 0,
              mortalityDucks: 0,
              initialWeightG: placeWeightG,
              currentAvgWeightG: placeWeightG,
              currentCycleDay: 1,
              startDate: today,
              status: 'ACTIVE',
              cumulativeFeedKg: 0,
              finalFcr: undefined,
              finalSoldWeightKg: undefined,
              sampleWeightsG: [placeWeightG - 2, placeWeightG, placeWeightG + 1, placeWeightG + 2, placeWeightG - 1],
              weightLogs: [],
              mortalityLogs: [],
            }
          : b
      ),
    }));
    showToast(`รับเป็ดเข้าใหม่ ${placeCount.toLocaleString()} ตัว ใน ${barn.name} เรียบร้อย`);
  };

  const handleOpenCloseBatch = (barn: Barn) => {
    playPixelClick(muted);
    const today = new Date().toISOString().slice(0, 10);
    const cycleSales = farm.salesRecords.filter(
      (r) => r.barnId === barn.id && r.saleDate >= barn.startDate
    );
    const cycleFeedLogs = farm.feedLogs.filter(
      (l) => l.barnId === barn.id && l.date >= barn.startDate
    );
    const feedFromLogsKg = cycleFeedLogs.reduce((s, l) => s + l.amountKg, 0);
    const totalFeedUsedKg = Math.round(
      barn.cumulativeFeedKg > 0 ? barn.cumulativeFeedKg : feedFromLogsKg
    );

    if (cycleSales.length > 0) {
      const soldDucks = cycleSales.reduce((s, r) => s + r.birdsSold, 0);
      const totalSoldWeightKg = cycleSales.reduce((s, r) => s + r.totalWeightKg, 0);
      const totalRevenueThb = cycleSales.reduce((s, r) => s + r.totalRevenueThb, 0);
      const totalCostThb = cycleSales.reduce(
        (s, r) =>
          s +
          r.ducklingCostThb +
          r.feedCostThb +
          (r.medicineCostThb || 0) +
          (r.utilityLaborCostThb || 0),
        0
      );
      setCloseHasMatchedSales(true);
      setCloseBatchName(cycleSales.map((r) => r.batchCode).join(', '));
      setCloseSoldDucks(soldDucks);
      setCloseTotalSoldWeightKg(Math.round(totalSoldWeightKg));
      setCloseTotalFeedUsedKg(totalFeedUsedKg);
      setCloseTotalRevenueThb(Math.round(totalRevenueThb));
      setCloseTotalCostThb(Math.round(totalCostThb));
    } else {
      const estSoldDucks = barn.currentDucks;
      const estSoldWeightKg =
        barn.finalSoldWeightKg && barn.finalSoldWeightKg > 0
          ? barn.finalSoldWeightKg
          : Math.round((estSoldDucks * (barn.currentAvgWeightG || 2800)) / 1000);
      const feedCostFromLogs = cycleFeedLogs.reduce((s, l) => s + l.costThb, 0);
      const estFeedCost = feedCostFromLogs > 0 ? feedCostFromLogs : totalFeedUsedKg * 15.5;
      const estDucklingCost = barn.initialDucks * 24;
      const estHiddenCost = estSoldDucks > 0 ? Math.round(estSoldDucks * 12) : 0;

      setCloseHasMatchedSales(false);
      setCloseBatchName(`รุ่น-${today.slice(0, 7)} (${barn.name.replace(/\(.*?\)/g, '').trim()})`);
      setCloseSoldDucks(estSoldDucks);
      setCloseTotalSoldWeightKg(Math.round(estSoldWeightKg));
      setCloseTotalFeedUsedKg(totalFeedUsedKg);
      setCloseTotalRevenueThb(Math.round(estSoldWeightKg * 57));
      setCloseTotalCostThb(Math.round(estDucklingCost + estFeedCost + estHiddenCost));
    }

    setCloseClosedDate(today);
    setClosingBarn(barn);
  };

  const handleConfirmCloseBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingBarn) return;
    playSuccessChime(muted);

    const initialDucks = closingBarn.initialDucks;
    const soldDucks = Math.max(0, closeSoldDucks);
    const totalSoldWeightKg = Math.max(0, closeTotalSoldWeightKg);
    const totalFeedUsedKg = Math.max(0, closeTotalFeedUsedKg);
    const totalRevenueThb = Math.max(0, closeTotalRevenueThb);
    const totalCostThb = Math.max(0, closeTotalCostThb);

    const survivalRatePct =
      initialDucks > 0 ? Number(((soldDucks / initialDucks) * 100).toFixed(1)) : 0;
    const avgWeightPerBirdKg =
      soldDucks > 0 ? Number((totalSoldWeightKg / soldDucks).toFixed(2)) : 0;
    const finalFcr =
      totalSoldWeightKg > 0 ? Number((totalFeedUsedKg / totalSoldWeightKg).toFixed(2)) : 0;
    const netProfitThb = Math.round(totalRevenueThb - totalCostThb);

    const newClosedBatch: ClosedBatch = {
      id: `cb-${Date.now()}`,
      barnId: closingBarn.id,
      batchName: closeBatchName.trim() || `รุ่นปิด-${closeClosedDate}`,
      barnName: closingBarn.name,
      startDate: closingBarn.startDate,
      closedDate: closeClosedDate,
      initialDucks,
      soldDucks,
      survivalRatePct,
      totalSoldWeightKg,
      avgWeightPerBirdKg,
      totalFeedUsedKg,
      finalFcr,
      totalRevenueThb: Math.round(totalRevenueThb),
      totalCostThb: Math.round(totalCostThb),
      netProfitThb,
    };

    const closedBarnName = closingBarn.name;
    onUpdateFarm((prev) => ({
      ...prev,
      closedBatches: [newClosedBatch, ...(prev.closedBatches ?? [])],
      barns: prev.barns.map((b) =>
        b.id === closingBarn.id
          ? {
              ...b,
              initialDucks: 0,
              currentDucks: 0,
              culledDucks: 0,
              mortalityDucks: 0,
              currentAvgWeightG: 0,
              currentCycleDay: 0,
              cumulativeFeedKg: 0,
              finalFcr: undefined,
              finalSoldWeightKg: undefined,
              sampleWeightsG: [],
              mortalityLogs: [],
              status: 'CLEANING',
              cleaningChecklist: {
                muckOut: false,
                washAndScrub: false,
                disinfect: false,
                restDaysCompleted: 0,
                targetRestDays: b.cleaningChecklist?.targetRestDays || 14,
              },
            }
          : b
      ),
    }));

    setClosingBarn(null);
    setLastClosedBatch(newClosedBatch);
    showToast(
      `ปิดรุ่น "${newClosedBatch.batchName}" (FCR ${finalFcr.toFixed(2)}) และปรับสถานะ ${closedBarnName} เป็นพักเล้า/ทำความสะอาดแล้ว`
    );
  };

  const handleAddBarn = () => {
    playPixelClick(muted);
    const nextIdx = farm.barns.length + 1;
    const newId = `barn-${Date.now()}`;
    onUpdateFarm((prev) => ({
      ...prev,
      barns: [
        ...prev.barns,
        {
          id: newId,
          name: `โรงเรือน ${nextIdx}`,
          breed: 'Cherry Valley SM3',
          areaSqm: 350,
          initialDucks: 0,
          currentDucks: 0,
          culledDucks: 0,
          mortalityDucks: 0,
          initialWeightG: 53,
          currentAvgWeightG: 0,
          cycleDays: 45,
          currentCycleDay: 0,
          startDate: new Date().toISOString().slice(0, 10),
          status: 'READY',
          cumulativeFeedKg: 0,
          sampleWeightsG: [],
          mortalityLogs: [],
          cleaningChecklist: {
            muckOut: true,
            washAndScrub: true,
            disinfect: true,
            restDaysCompleted: 14,
            targetRestDays: 14,
          },
        },
      ],
      environments: [
        ...prev.environments,
        {
          barnId: newId,
          temperatureC: 28,
          humidityPct: 62,
          windSpeedMs: 1.4,
          ammoniaPpm: 3.0,
          lightOn: false,
          lightIntensityPct: 0,
          lightStartTime: '18:00',
          lightEndTime: '06:00',
          isBroodingBarn: false,
          brooderEnabled: false,
          brooderTargetTempC: 30,
          brooderPowerPct: 0,
          huddlingState: 'OPTIMAL',
          autoBrooderEnabled: false,
          autoBrooderGraceSeconds: 10,
          lastHuddlingDetectedAt: null,
          autoAdjustLogs: [],
        },
      ],
    }));
    setSelectedBarnId(newId);
  };

  const handleDeleteBarn = (barn: Barn) => {
    if (farm.barns.length <= 1) {
      showToast('ต้องมีโรงเรือนอย่างน้อย 1 หลังในฟาร์ม');
      setConfirmDeleteBarnId(null);
      return;
    }
    playPixelClick(muted);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.filter((b) => b.id !== barn.id),
      environments: prev.environments.filter((env) => env.barnId !== barn.id),
      calendarEvents: prev.calendarEvents.filter((ev) => ev.barnId !== barn.id),
    }));
    if (selectedBarnId === barn.id) {
      setSelectedBarnId('ALL');
    }
    if (closingBarn?.id === barn.id) {
      setClosingBarn(null);
    }
    setConfirmDeleteBarnId(null);
    showToast(`ลบโรงเรือน "${barn.name}" แล้ว`);
  };

  const handleAddCalendarEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBarn = selectedBarn || farm.barns[0];
    if (!targetBarn || !newEventTitle.trim()) return;
    playSuccessChime(muted);

    const newEv: CalendarEvent = {
      id: `ev-${Date.now()}`,
      barnId: targetBarn.id,
      date: newEventDate,
      title: newEventTitle.trim(),
      category: newEventCategory,
      sticker: newEventSticker,
      notifyGoogleCalendar: newEventGCal,
      notifyLine: newEventLine,
      notes: newEventNotes.trim() || undefined,
    };

    onUpdateFarm((prev) => ({
      ...prev,
      calendarEvents: [...prev.calendarEvents, newEv],
    }));

    setNewEventTitle('');
    setNewEventNotes('');

    if (newEventGCal && accessToken) {
      try {
        await createGoogleCalendarEvent(accessToken, newEv, targetBarn.name, farm.name);
        onUpdateFarm((prev) => ({
          ...prev,
          calendarEvents: prev.calendarEvents.map((ev) =>
            ev.id === newEv.id ? { ...ev, syncedToGoogleCalendar: true } : ev
          ),
        }));
      } catch {
        // user can click retry or download .ics
      }
    }

    if (newEventLine) {
      await handleSendLine(newEv, targetBarn.name);
    } else {
      showToast(`เพิ่มกิจกรรม "${newEv.title}" พร้อมสติกเกอร์ลงปฏิทินแล้ว`);
    }
  };

  const handleSendLine = async (ev: CalendarEvent, barnName: string) => {
    const msg = `\n[Duck Valley Farm]\nฟาร์ม: ${farm.name}\nโรงเรือน: ${barnName}\nวันที่: ${ev.date}\nกำหนดการ: ${ev.title}${ev.notes ? `\nหมายเหตุ: ${ev.notes}` : ''}`;
    const res = await sendLineFarmNotification(msg);
    if (res.sent) {
      showToast('ส่งแจ้งเตือนเข้ากลุ่ม LINE เรียบร้อยแล้ว');
    } else {
      showToast(`สร้างข้อความแจ้งเตือน LINE แล้ว (${res.mode === 'preview' ? 'โหมดตัวอย่าง — ตั้งค่า LINE_NOTIFY_TOKEN เพื่อส่งจริง' : res.error})`);
    }
  };

  const handleSyncGCal = async (ev: CalendarEvent, barnName: string) => {
    if (!accessToken) {
      downloadCalendarIcs(ev, barnName, farm.name);
      showToast('ดาวน์โหลดไฟล์ปฏิทิน (.ics) สำหรับนำเข้า Google Calendar แล้ว');
      return;
    }
    try {
      await createGoogleCalendarEvent(accessToken, ev, barnName, farm.name);
      onUpdateFarm((prev) => ({
        ...prev,
        calendarEvents: prev.calendarEvents.map((item) =>
          item.id === ev.id ? { ...item, syncedToGoogleCalendar: true } : item
        ),
      }));
      showToast('เพิ่มกิจกรรมลง Google Calendar พร้อมแจ้งเตือนเรียบร้อย!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เชื่อมต่อ Google Calendar ไม่สำเร็จ';
      showToast(msg.replace('GOOGLE_TOKEN_EXPIRED: ', ''));
    }
  };

  // Calendar grid generation
  const year = calMonthDate.getFullYear();
  const month = calMonthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = calMonthDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  const visibleEvents = farm.calendarEvents.filter((ev) =>
    selectedBarnId === 'ALL' ? true : ev.barnId === selectedBarnId
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="pixel-wood-panel w-full max-w-6xl max-h-[88vh] [@media(max-height:500px)]:max-h-[94vh] flex flex-col overflow-y-auto relative">
        {/* Header */}
        <div className="pixel-wood-header px-3.5 sm:px-5 py-3 sm:py-3.5 [@media(max-height:500px)]:py-2 flex items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-xl font-bold text-[#fff5dc] truncate">
              โรงเรือนเป็ดเนื้อ &amp; ปฏิทินฟาร์ม
            </h2>
            <p className="text-[11px] sm:text-xs text-amber-200/90 truncate">
              {farm.name} · รวมเป็ดคงเหลือ {totalStats.current.toLocaleString()} ตัว จาก {farm.barns.length} โรงเรือน
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              onClose();
            }}
            className="pixel-btn bg-[#d94a30] hover:bg-[#b93822] text-white p-1.5 sm:p-2 shrink-0 cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barn Selector & Mode Tabs */}
        <div className="bg-[#ebd2a2] border-b-2 border-[#8e4c1d] px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 sm:pb-0 sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                setSelectedBarnId('ALL');
              }}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold border-2 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                selectedBarnId === 'ALL'
                  ? 'bg-[#4a2612] text-[#fff5dc] border-[#2b180e]'
                  : 'bg-[#fbf0d4] text-[#4a2612] border-[#8e4c1d] hover:bg-amber-100'
              }`}
            >
              ภาพรวมทุกโรงเรือน ({farm.barns.length})
            </button>
            {farm.barns.map((barn) => (
              <button
                key={barn.id}
                type="button"
                onClick={() => {
                  playPixelClick(muted);
                  setSelectedBarnId(barn.id);
                }}
                className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold border-2 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  selectedBarnId === barn.id
                    ? 'bg-[#e69128] text-[#2b180e] border-[#4a2612]'
                    : 'bg-[#fbf0d4] text-[#4a2612] border-[#8e4c1d] hover:bg-amber-100'
                }`}
              >
                {barn.name}
              </button>
            ))}
            <button
              type="button"
              onClick={handleAddBarn}
              className="px-2.5 py-1.5 text-xs font-bold border-2 border-dashed border-[#723b18] text-[#5c2e14] hover:bg-amber-100 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              เพิ่มโรงเรือน
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-1 bg-[#d8b882] p-1 border-2 border-[#723b18] w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                setActiveTab('METRICS');
              }}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'METRICS' ? 'bg-[#fbf0d4] text-[#3a1f0f] shadow-sm' : 'text-[#5c2e14]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              ข้อมูลและกราฟ
            </button>
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                setActiveTab('CALENDAR');
              }}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                activeTab === 'CALENDAR' ? 'bg-[#fbf0d4] text-[#3a1f0f] shadow-sm' : 'text-[#5c2e14]'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              ปฏิทิน &amp; แจ้งเตือน
            </button>
          </div>
        </div>

        {notifyToast && (
          <div className="bg-emerald-100 border-b-2 border-emerald-700 px-5 py-2 text-xs font-bold text-emerald-950 flex flex-wrap items-center justify-between gap-2">
            <span>{notifyToast}</span>
            <button type="button" onClick={() => setNotifyToast(null)} className="underline cursor-pointer">
              ปิด
            </button>
          </div>
        )}

        {lastClosedBatch && (
          <div className="bg-[#fff9eb] border-b-2 border-[#8e4c1d] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="text-[#3a1f0f]">
              <strong className="font-display">สรุปผลรุ่นที่เพิ่งปิด: {lastClosedBatch.batchName}</strong>{' '}
              <span className="text-[#723b18] tabular-nums">
                (อัตรารอด {lastClosedBatch.survivalRatePct.toFixed(1)}% · FCR{' '}
                {lastClosedBatch.finalFcr.toFixed(2)} · กำไรสุทธิ ฿
                {lastClosedBatch.netProfitThb.toLocaleString()})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  playPixelClick(muted);
                  setSummaryModalBatch(lastClosedBatch);
                }}
                className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                ดูสรุปผลงานประจำรุ่น
              </button>
              <button
                type="button"
                disabled={exportingPdf}
                onClick={async () => {
                  playPixelClick(muted);
                  setExportingPdf(true);
                  try {
                    await exportBatchSummaryToPdf(
                      farm,
                      lastClosedBatch,
                      findMatchingSaleForBatch(farm, lastClosedBatch)
                    );
                    playSuccessChime(muted);
                  } finally {
                    setExportingPdf(false);
                  }
                }}
                className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-60 text-white font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                {exportingPdf ? 'กำลังสร้าง PDF...' : 'เซฟเป็น PDF'}
              </button>
              <button
                type="button"
                onClick={() => setLastClosedBatch(null)}
                className="underline text-[#723b18] font-bold px-1 cursor-pointer"
              >
                ซ่อน
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-4 sm:space-y-5">
          {activeTab === 'METRICS' ? (
            selectedBarn === null ? (
              /* ALL BARNS OVERVIEW */
              <div className="space-y-5">
                {(() => {
                  const farmMetrics = calculateFarmOverviewMetrics(farm.barns);
                  return (
                    <div className="pixel-card p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                          ดัชนีสมรรถภาพการผลิตเป็ดเนื้อภาพรวม (คำนวณอัตโนมัติ)
                        </h3>
                        <span className="text-xs text-[#723b18] tabular-nums">
                          คำนวณถ่วงน้ำหนักจากโรงเรือนที่กำลังเลี้ยง
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 lg:gap-3 tabular-nums">
                        <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5 lg:p-3">
                          <div className="text-[11px] font-bold text-[#723b18]">ADG (อัตราโต/วัน)</div>
                          <div className="font-mono-num text-base sm:text-lg lg:text-xl font-bold text-emerald-800 mt-0.5">
                            {farmMetrics.adgGramsPerDay.toFixed(1)} ก./วัน
                          </div>
                          <div className="text-[10px] text-[#5c2e14]">น้ำหนักเพิ่มเฉลี่ยต่อวัน</div>
                        </div>
                        <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5 lg:p-3">
                          <div className="text-[11px] font-bold text-[#723b18]">FI (กินอาหารเฉลี่ย)</div>
                          <div className="font-mono-num text-base sm:text-lg lg:text-xl font-bold text-[#3a1f0f] mt-0.5">
                            {farmMetrics.fiGramsPerDuckPerDay.toFixed(1)} ก./วัน
                          </div>
                          <div className="text-[10px] text-[#5c2e14]">
                            สะสม {farmMetrics.fiCumulativeKgPerDuck.toFixed(2)} กก./ตัว
                          </div>
                        </div>
                        <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5 lg:p-3">
                          <div className="text-[11px] font-bold text-[#723b18] flex items-center justify-between gap-1">
                            <span>
                              {farmMetrics.fcrStatus === 'FINAL' ? 'FCR ปิดรุ่น' : 'FCR คาดการณ์'}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 border font-bold ${
                                farmMetrics.fcrStatus === 'FINAL'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-700'
                                  : 'bg-sky-100 text-sky-900 border-sky-700'
                              }`}
                            >
                              {farmMetrics.fcrStatus === 'FINAL' ? 'ล็อกค่าจริง' : 'แนวโน้มชั่วคราว'}
                            </span>
                          </div>
                          <div
                            className={`font-mono-num text-base sm:text-lg lg:text-xl font-bold mt-0.5 ${
                              farmMetrics.fcr > 0 && farmMetrics.fcr <= 2.1
                                ? 'text-emerald-800'
                                : 'text-amber-800'
                            }`}
                          >
                            {farmMetrics.fcr.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-[#5c2e14]">
                            {farmMetrics.fcrStatus === 'FINAL'
                              ? 'จากน้ำหนักขายจริงหลังปิดรุ่น'
                              : 'อาหาร / (นน.สุ่ม × เป็ดคงเหลือ)'}
                          </div>
                        </div>
                        <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5 lg:p-3">
                          <div className="text-[11px] font-bold text-[#723b18]">FE (ประสิทธิภาพอาหาร)</div>
                          <div className="font-mono-num text-base sm:text-lg lg:text-xl font-bold text-sky-800 mt-0.5">
                            {farmMetrics.fePct.toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-[#5c2e14]">น้ำหนักที่ได้ต่ออาหาร 100 กก.</div>
                        </div>
                        <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5 lg:p-3 col-span-2 sm:col-span-3 lg:col-span-1">
                          <div className="text-[11px] font-bold text-[#723b18]">Uniformity (ความสม่ำเสมอ)</div>
                          <div
                            className={`font-mono-num text-base sm:text-lg lg:text-xl font-bold mt-0.5 ${
                              farmMetrics.uniformityPct >= 80 ? 'text-emerald-800' : 'text-amber-800'
                            }`}
                          >
                            {farmMetrics.uniformityPct.toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-[#5c2e14]">กลุ่มน้ำหนัก ±10% ค่าเฉลี่ย</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="pixel-card p-4">
                    <h3 className="font-display font-bold text-base text-[#3a1f0f] mb-3">
                      สัดส่วนประชากรเป็ดทั้งฟาร์ม (หักคัดทิ้งและตายแล้ว)
                    </h3>
                    <PixelDonutChart
                      slices={[
                        { label: 'เป็ดคงเหลือในเล้า', value: totalStats.current, color: '#22c55e' },
                        { label: 'คัดทิ้ง (Culled)', value: totalStats.culled, color: '#f59e0b' },
                        { label: 'ตายสะสม (Mortality)', value: totalStats.mortality, color: '#ef4444' },
                      ]}
                      centerValue={totalStats.current.toLocaleString()}
                      centerLabel="ตัวคงเหลือ"
                    />
                  </div>

                  <div className="pixel-card p-4">
                    <h3 className="font-display font-bold text-base text-[#3a1f0f] mb-3">
                      จำนวนเป็ดคงเหลือแยกตามโรงเรือน
                    </h3>
                    <PixelBarChart
                      items={farm.barns.map((b) => ({
                        label: b.name.replace(/\(.*?\)/g, '').trim(),
                        value: b.currentDucks,
                        color: b.status === 'ACTIVE' ? '#3b82f6' : '#94a3b8',
                      }))}
                      unit=" ตัว"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {farm.barns.map((barn) => {
                    const densityBirds = barn.areaSqm > 0 ? barn.currentDucks / barn.areaSqm : 0;
                    const densityKg =
                      barn.areaSqm > 0
                        ? (barn.currentDucks * (barn.currentAvgWeightG / 1000)) / barn.areaSqm
                        : 0;
                    const st = STATUS_LABELS[barn.status];
                    const bm = calculateBarnMetrics(barn);
                    const isConfirmingDelete = confirmDeleteBarnId === barn.id;

                    return (
                      <div
                        key={barn.id}
                        className="pixel-card p-4 flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-display font-bold text-base text-[#3a1f0f]">
                              {barn.name}
                            </h4>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[11px] font-bold px-2 py-0.5 border whitespace-nowrap ${st.color}`}
                              >
                                {st.th}
                              </span>
                              <button
                                type="button"
                                disabled={farm.barns.length <= 1}
                                onClick={() => {
                                  playPixelClick(muted);
                                  setConfirmDeleteBarnId(isConfirmingDelete ? null : barn.id);
                                }}
                                title={
                                  farm.barns.length <= 1
                                    ? 'ต้องมีโรงเรือนอย่างน้อย 1 หลัง'
                                    : `ลบ ${barn.name}`
                                }
                                aria-label={`ลบ ${barn.name}`}
                                className="p-1.5 border border-rose-700/60 bg-rose-50 hover:bg-rose-100 disabled:opacity-35 disabled:cursor-not-allowed text-rose-800 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-[#723b18] mt-1">
                            พันธุ์ {barn.breed} · พื้นที่ {barn.areaSqm} ตร.ม.
                          </div>
                        </div>

                        {isConfirmingDelete && (
                          <div className="bg-rose-100 border-2 border-rose-700 p-2 text-xs flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-rose-950">ยืนยันลบโรงเรือนนี้?</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBarnId(null)}
                                className="px-2 py-0.5 bg-white border border-[#723b18] font-semibold cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBarn(barn)}
                                className="px-2 py-0.5 bg-rose-600 text-white border border-rose-900 font-bold cursor-pointer"
                              >
                                ลบโรงเรือน
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-xs bg-[#f3e1b9] p-2.5 border border-[#c68443] tabular-nums">
                          <div>
                            <div className="text-[#723b18]">เป็ดคงเหลือ / เริ่มเลี้ยง</div>
                            <div className="font-mono-num font-bold text-[#3a1f0f]">
                              {barn.currentDucks.toLocaleString()} / {barn.initialDucks.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <div className="text-[#723b18]">อายุรอบเลี้ยง</div>
                            <div className="font-mono-num font-bold text-[#3a1f0f]">
                              วันที่ {barn.currentCycleDay} / {barn.cycleDays}
                            </div>
                          </div>
                          <div>
                            <div className="text-[#723b18]">ความหนาแน่น</div>
                            <div className="font-mono-num font-bold text-[#3a1f0f]">
                              {densityBirds.toFixed(2)} ตัว/ตร.ม. ({densityKg.toFixed(1)} กก./ตร.ม.)
                            </div>
                          </div>
                          <div>
                            <div className="text-[#723b18]">คัดทิ้ง / ตาย</div>
                            <div className="font-mono-num font-bold text-rose-800">
                              {barn.culledDucks + barn.mortalityDucks} ตัว
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-1 text-center bg-[#fff9eb] border border-[#c68443] p-1.5 text-[10px] tabular-nums">
                          <div>
                            <div className="text-[#723b18]">ADG</div>
                            <div className="font-mono-num font-bold text-[#3a1f0f]">{bm.adgGramsPerDay}</div>
                          </div>
                          <div>
                            <div className="text-[#723b18]">FI</div>
                            <div className="font-mono-num font-bold text-[#3a1f0f]">{bm.fiGramsPerDuckPerDay}</div>
                          </div>
                          <div>
                            <div className="text-[#723b18]">
                              {bm.fcrStatus === 'FINAL' ? 'FCR จริง' : 'FCR คาด'}
                            </div>
                            <div className="font-mono-num font-bold text-emerald-800">{bm.fcr}</div>
                          </div>
                          <div>
                            <div className="text-[#723b18]">FE</div>
                            <div className="font-mono-num font-bold text-sky-800">{bm.fePct}%</div>
                          </div>
                          <div>
                            <div className="text-[#723b18]">Unif.</div>
                            <div className="font-mono-num font-bold text-[#3a1f0f]">{bm.uniformityPct}%</div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              playPixelClick(muted);
                              setSelectedBarnId(barn.id);
                            }}
                            className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] text-xs font-bold py-2 cursor-pointer"
                          >
                            ดูรายละเอียด & จัดการโรงเรือนนี้
                          </button>
                          {(barn.initialDucks > 0 ||
                            barn.currentDucks > 0 ||
                            barn.cumulativeFeedKg > 0 ||
                            barn.status === 'ACTIVE') && (
                            <button
                              type="button"
                              onClick={() => handleOpenCloseBatch(barn)}
                              className="pixel-btn bg-[#6b3a1e] hover:bg-[#522b14] text-[#fff5dc] text-xs font-bold py-1.5 flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Archive className="w-3.5 h-3.5 text-amber-300" />
                              ปิดรุ่น & พักเล้า
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* SINGLE BARN DETAILED VIEW */
              <div className="space-y-5">
                {(() => {
                  const densityBirds =
                    selectedBarn.areaSqm > 0
                      ? selectedBarn.currentDucks / selectedBarn.areaSqm
                      : 0;
                  const densityKg =
                    selectedBarn.areaSqm > 0
                      ? (selectedBarn.currentDucks * (selectedBarn.currentAvgWeightG / 1000)) /
                        selectedBarn.areaSqm
                      : 0;
                  const totalLoss = selectedBarn.culledDucks + selectedBarn.mortalityDucks;
                  const lossRate =
                    selectedBarn.initialDucks > 0
                      ? (totalLoss / selectedBarn.initialDucks) * 100
                      : 0;
                  const densityHigh = densityBirds > 7.5 || densityKg > 24;
                  const bm = calculateBarnMetrics(selectedBarn);
                  const isConfirmingSelectedDelete = confirmDeleteBarnId === selectedBarn.id;

                  return (
                    <>
                      {/* Single Barn Header Action Strip (Close Batch, Status & Delete) */}
                      <div className="pixel-card px-4 py-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-display font-bold text-base text-[#3a1f0f]">
                              {selectedBarn.name}
                            </span>
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 border ${STATUS_LABELS[selectedBarn.status].color}`}
                            >
                              {STATUS_LABELS[selectedBarn.status].th}
                            </span>
                            <span className="text-xs text-[#723b18] font-mono-num">
                              เริ่มรุ่น {selectedBarn.startDate}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {(selectedBarn.initialDucks > 0 ||
                              selectedBarn.currentDucks > 0 ||
                              selectedBarn.cumulativeFeedKg > 0 ||
                              selectedBarn.status === 'ACTIVE') && (
                              <button
                                type="button"
                                onClick={() => handleOpenCloseBatch(selectedBarn)}
                                className="pixel-btn bg-[#6b3a1e] hover:bg-[#522b14] text-[#fff5dc] text-xs font-bold px-4 py-2 flex items-center gap-1.5 cursor-pointer"
                              >
                                <Archive className="w-4 h-4 text-amber-300" />
                                ปิดรุ่น &amp; พักเล้า
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={farm.barns.length <= 1}
                              onClick={() => {
                                playPixelClick(muted);
                                setConfirmDeleteBarnId(
                                  isConfirmingSelectedDelete ? null : selectedBarn.id
                                );
                              }}
                              title={
                                farm.barns.length <= 1
                                  ? 'ต้องมีโรงเรือนอย่างน้อย 1 หลัง'
                                  : `ลบ ${selectedBarn.name}`
                              }
                              className="pixel-btn bg-rose-50 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed text-rose-800 border-2 border-rose-700 text-xs font-bold px-3 py-2 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              ลบโรงเรือน
                            </button>
                          </div>
                        </div>

                        {isConfirmingSelectedDelete && (
                          <div className="bg-rose-100 border-2 border-rose-700 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-rose-950">
                              ยืนยันลบ "{selectedBarn.name}" ออกจากฟาร์ม? (ประวัติปิดรุ่นและยอดขายเดิมจะยังอยู่ครบ)
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteBarnId(null)}
                                className="px-2.5 py-1 bg-white border border-[#723b18] font-semibold cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBarn(selectedBarn)}
                                className="px-2.5 py-1 bg-rose-600 text-white border border-rose-900 font-bold cursor-pointer"
                              >
                                ยืนยันลบโรงเรือน
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
                        <div className="pixel-card p-3.5">
                          <div className="text-xs text-[#723b18]">เป็ดคงเหลือปัจจุบัน</div>
                          <div className="font-mono-num text-2xl font-bold text-emerald-800 mt-0.5">
                            {selectedBarn.currentDucks.toLocaleString()} ตัว
                          </div>
                          <div className="text-[11px] text-[#5c2e14] mt-1">
                            เริ่มเลี้ยง {selectedBarn.initialDucks.toLocaleString()} ตัว
                          </div>
                        </div>
                        <div className="pixel-card p-3.5">
                          <div className="text-xs text-[#723b18]">ความหนาแน่นในโรงเรือน</div>
                          <div
                            className={`font-mono-num text-2xl font-bold mt-0.5 ${
                              densityHigh ? 'text-rose-700' : 'text-[#3a1f0f]'
                            }`}
                          >
                            {densityBirds.toFixed(2)} ตัว/ตร.ม.
                          </div>
                          <div className="text-[11px] text-[#5c2e14] mt-1 flex items-center gap-1">
                            {densityHigh && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                            <span>{densityKg.toFixed(1)} กก./ตร.ม. (พื้นที่ {selectedBarn.areaSqm} ตร.ม.)</span>
                          </div>
                        </div>
                        <div className="pixel-card p-3.5">
                          <div className="text-xs text-[#723b18]">น้ำหนักเฉลี่ย (เริ่ม → ปัจจุบัน)</div>
                          <div className="font-mono-num text-2xl font-bold text-[#3a1f0f] mt-0.5">
                            {selectedBarn.currentAvgWeightG.toLocaleString()} ก.
                          </div>
                          <div className="text-[11px] text-[#5c2e14] mt-1">
                            แรกเข้า {selectedBarn.initialWeightG} ก. · ADG {bm.adgGramsPerDay} ก./วัน
                          </div>
                        </div>
                        <div className="pixel-card p-3.5">
                          <div className="text-xs text-[#723b18]">วันเลี้ยง / อัตราสูญเสีย</div>
                          <div className="font-mono-num text-2xl font-bold text-[#3a1f0f] mt-0.5">
                            {selectedBarn.currentCycleDay} / {selectedBarn.cycleDays} วัน
                          </div>
                          <div className="text-[11px] text-rose-800 font-semibold mt-1">
                            คัดทิ้ง+ตาย {totalLoss} ตัว ({lossRate.toFixed(2)}%)
                          </div>
                        </div>
                      </div>

                      {/* 5 Livestock Parameters Strip */}
                      <div className="pixel-card p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-display font-bold text-sm text-[#3a1f0f]">
                            ค่าพารามิเตอร์ประสิทธิภาพฝูง (คำนวณอัตโนมัติ)
                          </h3>
                          <span className="text-[11px] text-[#723b18] tabular-nums">
                            อาหารสะสม {bm.effectiveFeedKg.toLocaleString()} กก. · น้ำหนักสุ่มเฉลี่ย{' '}
                            {bm.sampleMeanWeightG.toLocaleString()} ก. · น้ำหนักรวม{' '}
                            {bm.estimatedLiveWeightKg.toLocaleString()} กก.
                          </span>
                        </div>

                        {(() => {
                          const stageInfo =
                            FEED_STAGE_INFO[getFeedStageForAge(selectedBarn.currentCycleDay)];
                          const feedAlert = getBarnFeedStageAlert(
                            selectedBarn,
                            farm.feedSilos,
                            farm.feedFormulas,
                            farm.feedLogs
                          );
                          return (
                            <div
                              className={`px-3 py-2 border text-xs font-semibold flex flex-wrap items-center justify-between gap-2 ${
                                feedAlert.severity !== 'ok'
                                  ? 'bg-amber-100 border-amber-700 text-amber-950'
                                  : 'bg-[#fff9eb] border-[#c68443] text-[#4a2612]'
                              }`}
                            >
                              <span>
                                ช่วงวัยสูตรอาหาร: <strong>{stageInfo.labelTh}</strong> (
                                {stageInfo.ageRangeTh})
                              </span>
                              {feedAlert.severity !== 'ok' && (
                                <span className="flex items-center gap-1 text-amber-900 font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  {feedAlert.message}
                                </span>
                              )}
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 tabular-nums">
                          <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5">
                            <div className="text-[11px] font-bold text-[#723b18]">ADG</div>
                            <div className="font-mono-num text-lg font-bold text-emerald-800">
                              {bm.adgGramsPerDay.toFixed(1)} ก./วัน
                            </div>
                          </div>
                          <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5">
                            <div className="text-[11px] font-bold text-[#723b18]">FI (กินอาหาร)</div>
                            <div className="font-mono-num text-lg font-bold text-[#3a1f0f]">
                              {bm.fiGramsPerDuckPerDay.toFixed(1)} ก./วัน
                            </div>
                          </div>
                          <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5">
                            <div className="text-[11px] font-bold text-[#723b18] flex items-center justify-between gap-1">
                              <span>
                                {bm.fcrStatus === 'FINAL' ? 'FCR ปิดรุ่น' : 'FCR คาดการณ์'}
                              </span>
                              <span
                                className={`text-[9px] px-1 border ${
                                  bm.fcrStatus === 'FINAL'
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-700'
                                    : 'bg-sky-100 text-sky-900 border-sky-700'
                                }`}
                              >
                                {bm.fcrStatus === 'FINAL' ? 'ล็อกจริง' : 'คาดการณ์'}
                              </span>
                            </div>
                            <div className="font-mono-num text-lg font-bold text-emerald-800">
                              {bm.fcr.toFixed(2)}
                            </div>
                          </div>
                          <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5">
                            <div className="text-[11px] font-bold text-[#723b18]">FE (ประสิทธิภาพ)</div>
                            <div className="font-mono-num text-lg font-bold text-sky-800">
                              {bm.fePct.toFixed(1)}%
                            </div>
                          </div>
                          <div className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5 col-span-2 sm:col-span-3 lg:col-span-1">
                            <div className="text-[11px] font-bold text-[#723b18]">Uniformity</div>
                            <div className="font-mono-num text-lg font-bold text-[#3a1f0f]">
                              {bm.uniformityPct.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                          <div>
                            <label className="font-bold text-[#4a2612] block mb-1">
                              ปริมาณอาหารสะสมในรอบนี้ (กก.)
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={selectedBarn.cumulativeFeedKg}
                              onChange={(e) =>
                                handleUpdateBarnField(selectedBarn.id, {
                                  cumulativeFeedKg: Math.max(0, Number(e.target.value)),
                                })
                              }
                              className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                            />
                          </div>
                          <div>
                            <label className="font-bold text-[#4a2612] block mb-1">
                              สุ่มชั่งน้ำหนักเป็ด (กรัม, คั่นด้วยลูกน้ำ) เพื่อคำนวณ Uniformity &amp; น้ำหนักเฉลี่ย
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={sampleWeightsText}
                                onFocus={() => setSampleWeightsFocused(true)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setSampleWeightsText(raw);
                                  const parsed = raw
                                    .split(',')
                                    .map((v) => Number(v.trim()))
                                    .filter((n) => Number.isFinite(n) && n > 0);
                                  if (parsed.length > 0) {
                                    const meanG = Math.round(
                                      parsed.reduce((sum, n) => sum + n, 0) / parsed.length
                                    );
                                    handleUpdateBarnField(selectedBarn.id, {
                                      sampleWeightsG: parsed,
                                      currentAvgWeightG: meanG,
                                    });
                                    setAvgWeightText(String(meanG));
                                  } else {
                                    handleUpdateBarnField(selectedBarn.id, { sampleWeightsG: [] });
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleRecordSampleWeights(selectedBarn);
                                  }
                                }}
                                onBlur={() => {
                                  setSampleWeightsFocused(false);
                                  const parsed = sampleWeightsText
                                    .split(',')
                                    .map((v) => Number(v.trim()))
                                    .filter((n) => Number.isFinite(n) && n > 0);
                                  setSampleWeightsText(parsed.join(', '));
                                }}
                                placeholder="เช่น 1920, 1960, 1980, 2010, 2040"
                                className="flex-1 min-w-0 bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                              />
                              <button
                                type="button"
                                disabled={
                                  sampleWeightsText
                                    .split(',')
                                    .map((v) => Number(v.trim()))
                                    .filter((n) => Number.isFinite(n) && n > 0).length === 0
                                }
                                onClick={() => handleRecordSampleWeights(selectedBarn)}
                                className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-3 py-1.5 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                บันทึก
                              </button>
                            </div>
                            {selectedBarn.sampleWeightsG.length > 0 && (
                              <p className="text-[11px] text-[#723b18] mt-1 font-mono-num">
                                คำนวณจาก {selectedBarn.sampleWeightsG.length} ตัว: เฉลี่ย{' '}
                                {bm.sampleMeanWeightG.toLocaleString()} ก. · Uniformity{' '}
                                {bm.uniformityPct.toFixed(1)}% (กด &quot;บันทึก&quot; เพื่อเก็บเข้าประวัติ)
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Donut Chart + Editable Parameters */}
                        <div className="pixel-card p-4 space-y-4">
                          <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                            สัดส่วนเป็ดและพารามิเตอร์โรงเรือน
                          </h3>
                          <PixelDonutChart
                            slices={[
                              { label: 'เป็ดคงเหลือ', value: selectedBarn.currentDucks, color: '#22c55e' },
                              { label: 'คัดทิ้ง (Culled)', value: selectedBarn.culledDucks, color: '#f59e0b' },
                              { label: 'ตาย (Mortality)', value: selectedBarn.mortalityDucks, color: '#ef4444' },
                            ]}
                            centerValue={`${(100 - lossRate).toFixed(1)}%`}
                            centerLabel="อัตรารอด"
                          />

                          <div className="grid grid-cols-2 gap-3 pt-2 border-t-2 border-[#e5cfa2] text-xs">
                            <div>
                              <label className="font-bold text-[#4a2612] block mb-1">สายพันธุ์</label>
                              <input
                                type="text"
                                value={selectedBarn.breed}
                                onChange={(e) =>
                                  handleUpdateBarnField(selectedBarn.id, { breed: e.target.value })
                                }
                                className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="font-bold text-[#4a2612] block mb-1">สถานะโรงเรือน</label>
                              <select
                                value={selectedBarn.status}
                                onChange={(e) =>
                                  handleUpdateBarnField(selectedBarn.id, {
                                    status: e.target.value as BarnStatus,
                                  })
                                }
                                className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                              >
                                {(Object.keys(STATUS_LABELS) as BarnStatus[]).map((key) => (
                                  <option key={key} value={key}>
                                    {STATUS_LABELS[key].th}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="font-bold text-[#4a2612] block mb-1">น้ำหนักเฉลี่ยปัจจุบัน (กรัม)</label>
                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={avgWeightText}
                                  onFocus={() => setAvgWeightFocused(true)}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/[^\d.,]/g, '');
                                    setAvgWeightText(raw);
                                    const numeric = Number(raw.replace(/,/g, ''));
                                    if (raw.trim() === '') {
                                      handleUpdateBarnField(selectedBarn.id, { currentAvgWeightG: 0 });
                                    } else if (Number.isFinite(numeric) && numeric >= 0) {
                                      handleUpdateBarnField(selectedBarn.id, {
                                        currentAvgWeightG: numeric,
                                      });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleRecordAvgWeight(selectedBarn);
                                    }
                                  }}
                                  onBlur={() => {
                                    setAvgWeightFocused(false);
                                    setAvgWeightText(String(selectedBarn.currentAvgWeightG ?? 0));
                                  }}
                                  placeholder="เช่น 1,980 หรือ 1980"
                                  className="flex-1 min-w-0 bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                                />
                                <button
                                  type="button"
                                  disabled={
                                    !Number.isFinite(Number(avgWeightText.replace(/,/g, ''))) ||
                                    Number(avgWeightText.replace(/,/g, '')) <= 0
                                  }
                                  onClick={() => handleRecordAvgWeight(selectedBarn)}
                                  className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-2.5 py-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                                  title="บันทึกน้ำหนักเฉลี่ยนี้ลงประวัติ"
                                >
                                  บันทึก
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="font-bold text-[#4a2612] block mb-1">วันที่เลี้ยงปัจจุบัน / รอบ (วัน)</label>
                              <div className="flex gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={selectedBarn.currentCycleDay}
                                  onChange={(e) =>
                                    handleUpdateBarnField(selectedBarn.id, {
                                      currentCycleDay: Math.max(0, Number(e.target.value)),
                                    })
                                  }
                                  className="w-1/2 bg-white border-2 border-[#723b18] px-2 py-1.5 font-mono-num"
                                />
                                <input
                                  type="number"
                                  min={1}
                                  value={selectedBarn.cycleDays}
                                  onChange={(e) =>
                                    handleUpdateBarnField(selectedBarn.id, {
                                      cycleDays: Math.max(1, Number(e.target.value)),
                                    })
                                  }
                                  className="w-1/2 bg-white border-2 border-[#723b18] px-2 py-1.5 font-mono-num"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Mortality / Culling Logger OR Place New Batch */}
                        <div className="space-y-4">
                          {selectedBarn.currentDucks > 0 ? (
                            <div className="pixel-card p-4 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                                  บันทึกเป็ดคัดทิ้ง / ตาย (หักออกจากยอดรวมอัตโนมัติ)
                                </h3>
                                <span className="text-[11px] font-mono-num text-[#723b18]">
                                  คงเหลือ {selectedBarn.currentDucks.toLocaleString()} ตัว
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <select
                                  value={logType}
                                  onChange={(e) => setLogType(e.target.value as 'MORTALITY' | 'CULL')}
                                  className="bg-white border-2 border-[#723b18] px-2 py-1.5 font-semibold"
                                >
                                  <option value="MORTALITY">ตาย (Mortality)</option>
                                  <option value="CULL">คัดทิ้ง (Culled)</option>
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  max={selectedBarn.currentDucks}
                                  value={logCount}
                                  onChange={(e) => setLogCount(Math.max(0, Number(e.target.value)))}
                                  className={`bg-white border-2 px-2 py-1.5 font-mono-num ${
                                    logCount > selectedBarn.currentDucks ||
                                    (logCount > 0 &&
                                      logCount <= selectedBarn.currentDucks &&
                                      (logCount / selectedBarn.currentDucks) * 100 > 1)
                                      ? 'border-red-700 bg-red-50 text-red-900 font-bold'
                                      : 'border-[#723b18]'
                                  }`}
                                  placeholder="จำนวนตัว"
                                />
                                <button
                                  type="button"
                                  disabled={logCount <= 0 || logCount > selectedBarn.currentDucks}
                                  onClick={() => handleLogLoss(selectedBarn)}
                                  className="pixel-btn bg-[#d94a30] hover:bg-[#b93822] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-3 py-1.5 cursor-pointer"
                                >
                                  หักยอดเป็ด
                                </button>
                              </div>
                              <input
                                type="text"
                                value={logReason}
                                onChange={(e) => setLogReason(e.target.value)}
                                placeholder="สาเหตุ เช่น ขาอ่อน, ความร้อน, อ่อนแอ..."
                                className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 text-xs"
                              />

                              {logCount > selectedBarn.currentDucks && (
                                <div className="bg-red-100 border-2 border-red-700 p-2.5 text-xs font-bold text-red-900 flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                                  <span>
                                    ล็อกการบันทึก: ห้ามกรอกเกินจำนวนเป็ดที่มีอยู่ในโรงเรือน (
                                    {selectedBarn.currentDucks.toLocaleString()} ตัว)
                                  </span>
                                </div>
                              )}

                              {logCount > 0 &&
                                logCount <= selectedBarn.currentDucks &&
                                (logCount / selectedBarn.currentDucks) * 100 > 1 && (
                                  <div
                                    role="alert"
                                    className="bg-[#dc2626] border-2 border-[#450a0a] text-white p-3 text-xs font-bold flex items-start gap-2.5 shadow-md"
                                  >
                                    <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-300 mt-0.5" />
                                    <div>
                                      <div>
                                        ยอดตายวันนี้สูงผิดปกติ (
                                        {((logCount / selectedBarn.currentDucks) * 100).toFixed(1)}%)
                                      </div>
                                      <div className="text-red-100 font-medium mt-0.5">
                                        โปรดตรวจสอบอุณหภูมิ น้ำดื่ม หรืออาการป่วยของฝูง
                                      </div>
                                    </div>
                                  </div>
                                )}

                              <div className="max-h-40 overflow-y-auto border-t-2 border-[#e5cfa2] pt-2 space-y-1.5">
                                {selectedBarn.mortalityLogs.length === 0 ? (
                                  <p className="text-xs text-[#723b18]">ยังไม่มีรายการคัดทิ้งหรือตายในรอบนี้</p>
                                ) : (
                                  selectedBarn.mortalityLogs.map((log) => (
                                    <div
                                      key={log.id}
                                      className="flex items-center justify-between text-xs bg-[#f3e1b9] px-2.5 py-1.5 border border-[#c68443]"
                                    >
                                      <div>
                                        <span className="font-mono-num font-bold mr-2">{log.date}</span>
                                        <span className="font-semibold">
                                          {log.type === 'CULL' ? '[คัดทิ้ง]' : '[ตาย]'} {log.reason}
                                        </span>
                                      </div>
                                      <span className="font-mono-num font-bold text-rose-800">
                                        -{log.count} ตัว
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="pixel-card p-4 space-y-3">
                              <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                                รับเป็ดเนื้อล็อตใหม่เข้าโรงเรือน
                              </h3>
                              <p className="text-xs text-[#5c2e14]">
                                โรงเรือนนี้ยังไม่มีเป็ด สามารถกรอกจำนวนรับเข้าเพื่อเริ่มรอบการเลี้ยงใหม่ได้ทันที
                              </p>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div>
                                  <label className="font-bold block mb-1">สายพันธุ์</label>
                                  <input
                                    type="text"
                                    value={placeBreed}
                                    onChange={(e) => setPlaceBreed(e.target.value)}
                                    className="w-full bg-white border-2 border-[#723b18] px-2 py-1.5"
                                  />
                                </div>
                                <div>
                                  <label className="font-bold block mb-1">จำนวนรับเข้า (ตัว)</label>
                                  <input
                                    type="number"
                                    min={10}
                                    value={placeCount}
                                    onChange={(e) => setPlaceCount(Number(e.target.value))}
                                    className="w-full bg-white border-2 border-[#723b18] px-2 py-1.5 font-mono-num"
                                  />
                                </div>
                                <div>
                                  <label className="font-bold block mb-1">น้ำหนักแรกเข้า (ก.)</label>
                                  <input
                                    type="number"
                                    min={30}
                                    value={placeWeightG}
                                    onChange={(e) => setPlaceWeightG(Number(e.target.value))}
                                    className="w-full bg-white border-2 border-[#723b18] px-2 py-1.5 font-mono-num"
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleStartNewBatch(selectedBarn)}
                                className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white text-xs font-bold px-4 py-2 cursor-pointer"
                              >
                                บันทึกรับเป็ดเข้าและเริ่มเลี้ยงรอบใหม่
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bottom Tabs: Per-Barn Recording History */}
                      <div className="pixel-card overflow-hidden">
                        <div className="bg-[#ebd2a2] border-b-2 border-[#723b18] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                playPixelClick(muted);
                                setBarnBottomTab('WEIGHT_HISTORY');
                              }}
                              className={`px-3 py-1.5 text-xs font-bold border-2 flex items-center gap-1.5 cursor-pointer ${
                                barnBottomTab === 'WEIGHT_HISTORY'
                                  ? 'bg-[#4a2612] text-[#fff5dc] border-[#2b180e]'
                                  : 'bg-[#fff9eb] text-[#4a2612] border-[#8e4c1d] hover:bg-amber-100'
                              }`}
                            >
                              <Scale className="w-3.5 h-3.5" />
                              ประวัติการบันทึกน้ำหนัก ({(selectedBarn.weightLogs || []).length})
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                playPixelClick(muted);
                                setBarnBottomTab('MORTALITY_HISTORY');
                              }}
                              className={`px-3 py-1.5 text-xs font-bold border-2 flex items-center gap-1.5 cursor-pointer ${
                                barnBottomTab === 'MORTALITY_HISTORY'
                                  ? 'bg-[#4a2612] text-[#fff5dc] border-[#2b180e]'
                                  : 'bg-[#fff9eb] text-[#4a2612] border-[#8e4c1d] hover:bg-amber-100'
                              }`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              ประวัติคัดทิ้ง / ตาย ({selectedBarn.mortalityLogs.length})
                            </button>
                          </div>
                          <span className="text-[11px] font-semibold text-[#723b18]">
                            {selectedBarn.name}
                          </span>
                        </div>

                        <div className="p-4">
                          {barnBottomTab === 'WEIGHT_HISTORY' ? (
                            (selectedBarn.weightLogs || []).length === 0 ? (
                              <div className="bg-[#fff9eb] border-2 border-dashed border-[#c68443] p-4 text-center text-xs text-[#723b18]">
                                ยังไม่มีประวัติการบันทึกน้ำหนักในโรงเรือนนี้ · กรอกน้ำหนักด้านบนแล้วกดปุ่ม{' '}
                                <span className="font-bold text-[#3a1f0f]">&quot;บันทึก&quot;</span>{' '}
                                เพื่อบันทึกประวัติแต่ละครั้ง
                              </div>
                            ) : (
                              <div className="overflow-x-auto border-2 border-[#c68443] bg-white max-h-64">
                                <table className="w-full min-w-[650px] text-xs border-collapse tabular-nums">
                                  <thead>
                                    <tr className="bg-[#f3e1b9] text-[#4a2612] font-bold border-b-2 border-[#c68443] sticky top-0">
                                      <th className="px-3 py-2 text-left">วันที่ / เวลา</th>
                                      <th className="px-3 py-2 text-center">อายุ (วัน)</th>
                                      <th className="px-3 py-2 text-left">ค่าน้ำหนักที่บันทึก (กรัม)</th>
                                      <th className="px-3 py-2 text-right">เฉลี่ย (ก.)</th>
                                      <th className="px-3 py-2 text-right">ADG (ก./วัน)</th>
                                      <th className="px-3 py-2 text-right">Uniformity</th>
                                      <th className="px-2 py-2 text-center">จัดการ</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#ebd2a2]">
                                    {(selectedBarn.weightLogs || []).map((entry) => {
                                      const entryAdg =
                                        typeof entry.adgGramsPerDay === 'number'
                                          ? entry.adgGramsPerDay
                                          : entry.cycleDay > 0
                                            ? Number(
                                                (
                                                  Math.max(
                                                    0,
                                                    entry.avgWeightG - selectedBarn.initialWeightG
                                                  ) / entry.cycleDay
                                                ).toFixed(1)
                                              )
                                            : 0;
                                      return (
                                        <tr key={entry.id} className="hover:bg-amber-50/70">
                                          <td className="px-3 py-2 font-mono-num whitespace-nowrap">
                                            <span className="font-bold text-[#3a1f0f]">{entry.date}</span>{' '}
                                            <span className="text-[#723b18]">{entry.timestamp}</span>
                                          </td>
                                          <td className="px-3 py-2 text-center font-mono-num">
                                            วันที่ {entry.cycleDay}
                                          </td>
                                          <td className="px-3 py-2 font-mono-num text-[#3a1f0f]">
                                            <div>{entry.weightsG.map((w) => w.toLocaleString()).join(', ')}</div>
                                            {entry.note && (
                                              <div className="text-[10px] text-[#723b18] font-sans">
                                                {entry.note}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono-num font-bold text-emerald-800 whitespace-nowrap">
                                            {entry.avgWeightG.toLocaleString()} ก.
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono-num font-bold text-amber-800 whitespace-nowrap">
                                            {entryAdg.toFixed(1)} ก./วัน
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono-num font-bold text-[#3a1f0f]">
                                            {entry.uniformityPct.toFixed(1)}%
                                          </td>
                                          <td className="px-2 py-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleDeleteWeightLog(selectedBarn.id, entry.id)
                                              }
                                              className="p-1 text-rose-700 hover:bg-rose-100 border border-transparent hover:border-rose-300 cursor-pointer"
                                              title="ลบประวัติรายการนี้"
                                              aria-label="ลบประวัติรายการนี้"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )
                          ) : selectedBarn.mortalityLogs.length === 0 ? (
                            <div className="bg-[#fff9eb] border-2 border-dashed border-[#c68443] p-4 text-center text-xs text-[#723b18]">
                              ยังไม่มีรายการคัดทิ้งหรือตายในรอบนี้ของ {selectedBarn.name}
                            </div>
                          ) : (
                            <div className="max-h-60 overflow-y-auto space-y-1.5">
                              {selectedBarn.mortalityLogs.map((log) => (
                                <div
                                  key={log.id}
                                  className="flex items-center justify-between text-xs bg-[#fff9eb] px-3 py-2 border border-[#c68443]"
                                >
                                  <div>
                                    <span className="font-mono-num font-bold mr-2">{log.date}</span>
                                    <span className="font-semibold">
                                      {log.type === 'CULL' ? '[คัดทิ้ง]' : '[ตาย]'} {log.reason}
                                    </span>
                                  </div>
                                  <span className="font-mono-num font-bold text-rose-800">
                                    -{log.count} ตัว
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )
          ) : (
            /* PER-BARN CALENDAR WITH PIXEL STICKERS & GOOGLE CALENDAR / LINE NOTIFICATIONS */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
              {/* Calendar Grid */}
              <div className="lg:col-span-8 pixel-card p-2.5 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-display font-bold text-sm sm:text-base text-[#3a1f0f] truncate">
                      ปฏิทิน: {selectedBarn ? selectedBarn.name : 'รวมทุกโรงเรือน'}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setCalMonthDate(new Date(year, month - 1, 1))}
                      className="p-1.5 border-2 border-[#723b18] bg-[#fff9eb] hover:bg-amber-100 cursor-pointer"
                      aria-label="เดือนก่อนหน้า"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-display font-bold text-xs sm:text-sm text-[#3a1f0f] min-w-[120px] sm:min-w-[140px] text-center">
                      {monthLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalMonthDate(new Date(year, month + 1, 1))}
                      className="p-1.5 border-2 border-[#723b18] bg-[#fff9eb] hover:bg-amber-100 cursor-pointer"
                      aria-label="เดือนถัดไป"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center text-[11px] sm:text-xs font-bold text-[#723b18] mb-1">
                    {['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                    {Array.from({ length: firstWeekday }, (_, i) => (
                      <div key={`empty-${i}`} className="h-14 sm:h-24 bg-[#ebd7ad]/50 border border-[#d6b680]" />
                    ))}
                    {Array.from({ length: daysInMonth }, (_, idx) => {
                      const dayNum = idx + 1;
                      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const dayEvents = visibleEvents.filter((ev) => ev.date === iso);
                      const isSelectedDate = newEventDate === iso;

                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => {
                            playPixelClick(muted);
                            setNewEventDate(iso);
                          }}
                          className={`h-14 sm:h-24 p-1 sm:p-1.5 border sm:border-2 text-left flex flex-col justify-between transition-colors cursor-pointer overflow-hidden ${
                            isSelectedDate
                              ? 'bg-amber-100 border-[#d97706] ring-1 sm:ring-0 ring-[#d97706]'
                              : dayEvents.length > 0
                                ? 'bg-[#fff5dc] border-[#b46d2d] hover:bg-amber-50'
                                : 'bg-[#fff9eb] border-[#c68443] hover:bg-amber-50'
                          }`}
                        >
                          <div className="flex items-start sm:items-center justify-between w-full gap-0.5">
                            <span className="font-mono-num text-[11px] sm:text-xs font-bold text-[#3a1f0f] leading-none">
                              {dayNum}
                            </span>
                            {/* Mobile compact sticker indicator */}
                            {dayEvents.length > 0 && (
                              <div className="flex sm:hidden items-center gap-0.5">
                                <PixelSticker type={dayEvents[0].sticker} size={13} />
                              </div>
                            )}
                            {/* Desktop Pixel Stickers directly inside calendar date cell */}
                            <div className="hidden sm:flex items-center gap-0.5">
                              {dayEvents.slice(0, 3).map((ev) => (
                                <span key={ev.id} title={ev.title}>
                                  <PixelSticker type={ev.sticker} size={16} />
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Mobile compact event indicator */}
                          {dayEvents.length > 0 && (
                            <div className="sm:hidden w-full flex items-center justify-between gap-0.5">
                              <span className="block h-1.5 flex-1 bg-[#e69128] border border-[#723b18]/50" />
                              {dayEvents.length > 1 && (
                                <span className="text-[9px] font-mono-num font-bold text-[#723b18] leading-none">
                                  +{dayEvents.length - 1}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Desktop event title badges */}
                          <div className="hidden sm:block space-y-0.5 w-full overflow-hidden">
                            {dayEvents.slice(0, 2).map((ev) => (
                              <div
                                key={ev.id}
                                className="text-[10px] leading-tight font-semibold text-[#4a2612] bg-[#f3e1b9] px-1 py-0.5 truncate border border-[#c68443]"
                              >
                                {ev.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-[9px] font-bold text-[#8e4c1d]">
                                +{dayEvents.length - 2} กิจกรรม
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Selected-Day Agenda Card */}
                {(() => {
                  const selectedDayEvents = visibleEvents.filter((ev) => ev.date === newEventDate);
                  return (
                    <div className="sm:hidden bg-[#fff9eb] border-2 border-[#8e4c1d] p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-display font-bold text-xs text-[#3a1f0f]">
                          กำหนดการวันที่ <span className="font-mono-num">{newEventDate}</span>
                        </h4>
                        <span className="text-[11px] font-bold text-[#723b18] font-mono-num">
                          {selectedDayEvents.length} รายการ
                        </span>
                      </div>
                      {selectedDayEvents.length === 0 ? (
                        <p className="text-[11px] text-[#723b18]">
                          ยังไม่มีกำหนดการในวันนี้ — แตะวันอื่นบนปฏิทิน หรือกรอกเพิ่มกิจกรรมด้านล่าง
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {selectedDayEvents.map((ev) => {
                            const bName =
                              farm.barns.find((b) => b.id === ev.barnId)?.name || 'โรงเรือน';
                            return (
                              <div
                                key={ev.id}
                                className="bg-[#fbf0d4] border border-[#c68443] p-2 text-xs space-y-1.5"
                              >
                                <div className="flex items-center gap-1.5 font-bold text-[#3a1f0f]">
                                  <PixelSticker type={ev.sticker} size={15} />
                                  <span>{ev.title}</span>
                                </div>
                                <div className="text-[11px] text-[#723b18]">
                                  {bName}
                                  {ev.notes ? ` · ${ev.notes}` : ''}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleSyncGCal(ev, bName)}
                                    className="px-2 py-1 text-[11px] bg-sky-100 hover:bg-sky-200 border border-sky-700 text-sky-900 font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                    {ev.syncedToGoogleCalendar
                                      ? 'ซิงค์ G-Cal แล้ว'
                                      : accessToken
                                        ? 'ส่งเข้า G-Cal'
                                        : 'ส่งออก (.ics)'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSendLine(ev, bName)}
                                    className="px-2 py-1 text-[11px] bg-emerald-100 hover:bg-emerald-200 border border-emerald-700 text-emerald-900 font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Bell className="w-3 h-3" />
                                    แจ้งเตือน LINE
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Add Event & Notification Sidebar */}
              <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4 items-start">
                <form onSubmit={handleAddCalendarEvent} className="pixel-card p-3 sm:p-4 space-y-3">
                  <h4 className="font-display font-bold text-sm sm:text-base text-[#3a1f0f]">
                    เพิ่มกิจกรรม &amp; สติกเกอร์ปฏิทิน
                  </h4>

                  <div className="text-xs space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label htmlFor="calendar-new-event-date" className="font-bold text-[#3a1f0f]">
                          วันที่
                        </label>
                        {newEventDate && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-[#f3e1b9] border border-[#c68443] text-[#5c2e14] tabular-nums">
                            {new Date(`${newEventDate}T00:00:00`).toLocaleDateString('th-TH', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                      </div>
                      <input
                        id="calendar-new-event-date"
                        type="date"
                        required
                        value={newEventDate}
                        onChange={(e) => setNewEventDate(e.target.value)}
                        className="block w-full min-w-0 max-w-full box-border h-[38px] sm:h-[34px] bg-white border-2 border-[#723b18] px-2.5 py-1 text-xs font-mono-num text-[#3a1f0f] focus:outline-none focus:border-[#d97706]"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">ชื่อกิจกรรม / กำหนดการ *</label>
                      <input
                        type="text"
                        required
                        value={newEventTitle}
                        onChange={(e) => setNewEventTitle(e.target.value)}
                        placeholder="เช่น ฉีดวัคซีนกาฬโรคเป็ด หรือ ส่งขายล็อต 12"
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-2 sm:py-1.5"
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">หมวดหมู่</label>
                      <select
                        value={newEventCategory}
                        onChange={(e) => {
                          const cat = e.target.value as CalendarCategory;
                          setNewEventCategory(cat);
                          const matched = CATEGORY_OPTIONS.find((c) => c.id === cat);
                          if (matched) setNewEventSticker(matched.sticker);
                        }}
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-2 sm:py-1.5"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold block mb-1">เลือก Sticker Pixel ประจำช่องวัน</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {STICKER_LIST.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setNewEventSticker(st.id)}
                            className={`flex items-center gap-1.5 p-2 sm:p-1.5 border-2 cursor-pointer ${
                              newEventSticker === st.id
                                ? 'bg-amber-200 border-[#4a2612]'
                                : 'bg-white border-[#c68443]'
                            }`}
                          >
                            <PixelSticker type={st.id} size={16} />
                            <span className="text-[11px] font-medium truncate">{st.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="flex items-center gap-2 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newEventGCal}
                          onChange={(e) => setNewEventGCal(e.target.checked)}
                        />
                        <span>แจ้งเตือนผ่าน Google Calendar</span>
                      </label>
                      <label className="flex items-center gap-2 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newEventLine}
                          onChange={(e) => setNewEventLine(e.target.checked)}
                        />
                        <span>ส่งแจ้งเตือนเข้า LINE ทันที</span>
                      </label>
                    </div>

                    <input
                      type="text"
                      value={newEventNotes}
                      onChange={(e) => setNewEventNotes(e.target.value)}
                      placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-2 sm:py-1.5"
                    />
                  </div>

                  <button
                    type="submit"
                    className="pixel-btn w-full bg-[#4ea832] hover:bg-[#429229] text-white text-xs font-bold py-2.5 sm:py-2 cursor-pointer"
                  >
                    + บันทึกกิจกรรมลงปฏิทิน
                  </button>
                </form>

                {/* Upcoming events quick action list */}
                <div className="pixel-card p-3 sm:p-4 space-y-2.5 lg:max-h-72 lg:overflow-y-auto">
                  <h4 className="font-display font-bold text-sm text-[#3a1f0f]">
                    รายการกำหนดการ ({visibleEvents.length})
                  </h4>
                  {visibleEvents.map((ev) => {
                    const bName = farm.barns.find((b) => b.id === ev.barnId)?.name || 'โรงเรือน';
                    return (
                      <div
                        key={ev.id}
                        className="bg-[#fff9eb] border-2 border-[#c68443] p-2.5 text-xs space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-bold text-[#3a1f0f]">
                            <PixelSticker type={ev.sticker} size={16} />
                            <span>{ev.title}</span>
                          </div>
                        </div>
                        <div className="text-[11px] text-[#723b18] font-mono-num">
                          {ev.date} · {bName}
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleSyncGCal(ev, bName)}
                            className="px-2 py-1 bg-sky-100 hover:bg-sky-200 border border-sky-700 text-sky-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            {ev.syncedToGoogleCalendar
                              ? 'ซิงค์ Google Calendar แล้ว'
                              : accessToken
                                ? 'ส่งเข้า Google Calendar'
                                : 'ส่งออก (.ics) G-Calendar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendLine(ev, bName)}
                            className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 border border-emerald-700 text-emerald-900 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Bell className="w-3 h-3" />
                            แจ้งเตือน LINE
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Close Batch Confirmation & Summary Modal */}
        {closingBarn && (() => {
          const previewSurvival =
            closingBarn.initialDucks > 0
              ? (closeSoldDucks / closingBarn.initialDucks) * 100
              : 0;
          const previewAvgWt =
            closeSoldDucks > 0 ? closeTotalSoldWeightKg / closeSoldDucks : 0;
          const previewFcr =
            closeTotalSoldWeightKg > 0
              ? closeTotalFeedUsedKg / closeTotalSoldWeightKg
              : 0;
          const previewProfit = closeTotalRevenueThb - closeTotalCostThb;

          return (
            <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
              <form
                onSubmit={handleConfirmCloseBatch}
                className="pixel-wood-panel max-w-xl w-full max-h-[88vh] overflow-y-auto"
              >
                <div className="pixel-wood-header px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-5 h-5 text-amber-300" />
                    <div>
                      <h3 className="font-display font-bold text-base text-[#fff5dc]">
                        ปิดรุ่นการเลี้ยง &amp; พักเล้า · {closingBarn.name}
                      </h3>
                      <p className="text-[11px] text-amber-200/90">
                        {closeHasMatchedSales
                          ? 'สรุปยอดอัตโนมัติจากบันทึกการขายและอาหารที่ใช้ในรอบนี้'
                          : 'ยังไม่มีบันทึกการขายรอบนี้ ระบบประมาณค่าจากฝูงปัจจุบัน — ตรวจสอบหรือแก้ไขตัวเลขก่อนยืนยัน'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClosingBarn(null)}
                    className="pixel-btn bg-[#d94a30] text-white p-1.5 cursor-pointer"
                    aria-label="ปิดหน้าต่างยืนยัน"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-[#4a2612] block mb-1">ชื่อรุ่นการเลี้ยง</label>
                      <input
                        type="text"
                        required
                        value={closeBatchName}
                        onChange={(e) => setCloseBatchName(e.target.value)}
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#4a2612] block mb-1">วันที่ปิดรุ่น</label>
                      <input
                        type="date"
                        required
                        value={closeClosedDate}
                        onChange={(e) => setCloseClosedDate(e.target.value)}
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#4a2612] block mb-1">
                        จำนวนเป็ดที่ขายได้ (ตัว) · แรกเข้า {closingBarn.initialDucks.toLocaleString()}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={closeSoldDucks}
                        onChange={(e) => setCloseSoldDucks(Math.max(0, Number(e.target.value)))}
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#4a2612] block mb-1">น้ำหนักขายรวม (กก.)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={closeTotalSoldWeightKg}
                        onChange={(e) =>
                          setCloseTotalSoldWeightKg(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#4a2612] block mb-1">อาหารที่ใช้รวม (กก.)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={closeTotalFeedUsedKg}
                        onChange={(e) =>
                          setCloseTotalFeedUsedKg(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#4a2612] block mb-1">รายได้รวม (บาท)</label>
                      <input
                        type="number"
                        min={0}
                        value={closeTotalRevenueThb}
                        onChange={(e) =>
                          setCloseTotalRevenueThb(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="font-bold text-[#4a2612] block mb-1">ต้นทุนรวมทั้งหมด (บาท)</label>
                      <input
                        type="number"
                        min={0}
                        value={closeTotalCostThb}
                        onChange={(e) =>
                          setCloseTotalCostThb(Math.max(0, Number(e.target.value)))
                        }
                        className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                      />
                    </div>
                  </div>

                  {/* Live Calculated Summary Strip */}
                  <div className="bg-[#f3e1b9] border-2 border-[#8e4c1d] p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums">
                    <div>
                      <div className="text-[11px] text-[#723b18]">อัตราการรอด</div>
                      <div className="font-mono-num font-bold text-sm text-emerald-900">
                        {previewSurvival.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#723b18]">นน.เฉลี่ย/ตัว</div>
                      <div className="font-mono-num font-bold text-sm text-[#3a1f0f]">
                        {previewAvgWt.toFixed(2)} กก.
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#723b18]">ค่า FCR ปิดรุ่น</div>
                      <div className="font-mono-num font-bold text-sm text-[#3a1f0f]">
                        {previewFcr.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#723b18]">กำไรสุทธิ</div>
                      <div
                        className={`font-mono-num font-bold text-sm ${
                          previewProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        ฿{Math.round(previewProfit).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-600 p-2.5 text-[11px] text-[#5c2e14]">
                    เมื่อยืนยัน ระบบจะบันทึกข้อมูลลงประวัติรุ่นที่ปิดแล้ว รีเซ็ตจำนวนเป็ดและอาหารที่ใช้ของ{' '}
                    <strong>{closingBarn.name}</strong> เป็น 0 และเปลี่ยนสถานะโรงเรือนเป็น{' '}
                    <strong>ทำความสะอาด / พักเล้า (Cleaning)</strong>
                  </div>

                  <div className="flex justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setClosingBarn(null)}
                      className="pixel-btn bg-[#e5cfa2] text-[#3a1f0f] font-bold px-4 py-2 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white font-bold px-5 py-2 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Archive className="w-4 h-4" />
                      ยืนยันปิดรุ่น &amp; พักเล้า
                    </button>
                  </div>
                </div>
              </form>
            </div>
          );
        })()}
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
