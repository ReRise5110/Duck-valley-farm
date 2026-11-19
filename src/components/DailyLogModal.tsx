import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  ClipboardPenLine,
  Thermometer,
  Wheat,
  Skull,
} from 'lucide-react';
import { FarmData } from '../types/farm';
import {
  FEED_STAGE_INFO,
  getBarnFeedStageAlert,
  getFeedStageForAge,
  getRecommendedRationGramsPerDuck,
} from '../utils/livestockMetrics';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

interface DailyLogModalProps {
  farm: FarmData;
  onUpdateFarm: (updater: (prev: FarmData) => FarmData) => void;
  onClose: () => void;
  muted: boolean;
}

export const DailyLogModal: React.FC<DailyLogModalProps> = ({
  farm,
  onUpdateFarm,
  onClose,
  muted,
}) => {
  const defaultBarn =
    farm.barns.find((b) => b.status === 'ACTIVE' && b.currentDucks > 0) || farm.barns[0];

  const [barnId, setBarnId] = useState<string>(defaultBarn?.id || '');
  const selectedBarn = useMemo(
    () => farm.barns.find((b) => b.id === barnId) || farm.barns[0] || null,
    [farm.barns, barnId]
  );

  const selectedEnv = useMemo(
    () => farm.environments.find((e) => e.barnId === selectedBarn?.id) || farm.environments[0],
    [farm.environments, selectedBarn]
  );

  const expectedStage = selectedBarn ? getFeedStageForAge(selectedBarn.currentCycleDay) : 'STARTER';
  const expectedStageMeta = FEED_STAGE_INFO[expectedStage];

  const recommendedSiloId = useMemo(() => {
    const matched = farm.feedSilos.find((s) => {
      const f = farm.feedFormulas.find((fm) => fm.id === s.formulaId);
      return f?.stage === expectedStage && s.remainingKg > 0;
    });
    return matched?.id || farm.feedSilos[0]?.id || '';
  }, [farm.feedSilos, farm.feedFormulas, expectedStage]);

  const recommendedFeedKg = useMemo(() => {
    if (!selectedBarn || selectedBarn.currentDucks <= 0) return 0;
    const { gramsPerDuck } = getRecommendedRationGramsPerDuck(selectedBarn.currentCycleDay);
    return Math.round((selectedBarn.currentDucks * gramsPerDuck) / 1000);
  }, [selectedBarn]);

  const [lossType, setLossType] = useState<'MORTALITY' | 'CULL'>('MORTALITY');
  const [lossCount, setLossCount] = useState<number>(0);
  const [lossReason, setLossReason] = useState<string>('');
  const [siloId, setSiloId] = useState<string>(recommendedSiloId);
  const [feedKg, setFeedKg] = useState<number>(recommendedFeedKg);
  const [temperatureC, setTemperatureC] = useState<number>(selectedEnv?.temperatureC ?? 28);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Sync defaults when user switches barn
  useEffect(() => {
    setSiloId(recommendedSiloId);
    setFeedKg(recommendedFeedKg);
    setLossCount(0);
    setLossReason('');
    if (selectedEnv) {
      setTemperatureC(selectedEnv.temperatureC);
    }
  }, [barnId, recommendedSiloId, recommendedFeedKg, selectedEnv?.barnId]);

  const selectedSilo = farm.feedSilos.find((s) => s.id === siloId) || null;
  const selectedSiloFormula = selectedSilo
    ? farm.feedFormulas.find((f) => f.id === selectedSilo.formulaId) || null
    : null;

  const barnFeedAlert = selectedBarn
    ? getBarnFeedStageAlert(selectedBarn, farm.feedSilos, farm.feedFormulas, farm.feedLogs)
    : null;

  // Validation checks (Req 5 & Req 6)
  const currentDucks = selectedBarn?.currentDucks ?? 0;
  const lossExceedsBarn = lossCount > currentDucks;
  const dailyMortalityPct =
    currentDucks > 0 && lossCount > 0 ? (lossCount / currentDucks) * 100 : 0;
  const isAbnormalMortality =
    !lossExceedsBarn && lossCount > 0 && dailyMortalityPct > 1;

  const siloRemainingKg = selectedSilo?.remainingKg ?? 0;
  const feedExceedsSilo = feedKg > 0 && (!selectedSilo || feedKg > siloRemainingKg);
  const hasFormulaMismatch =
    selectedBarn &&
    selectedBarn.currentDucks > 0 &&
    selectedSiloFormula &&
    selectedSiloFormula.stage !== expectedStage;

  const isInvalid =
    !selectedBarn ||
    lossCount < 0 ||
    feedKg < 0 ||
    lossExceedsBarn ||
    feedExceedsSilo ||
    !Number.isFinite(temperatureC);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalid || !selectedBarn) return;

    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const deductFeed = feedKg > 0 && selectedSilo ? Math.min(selectedSilo.remainingKg, feedKg) : 0;
    const feedCost = Number((deductFeed * (selectedSiloFormula?.pricePerKg ?? 15.5)).toFixed(2));

    playSuccessChime(muted);

    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) => {
        if (b.id !== selectedBarn.id) return b;
        const nextDucks = Math.max(0, b.currentDucks - lossCount);
        const nextMortalityLogs =
          lossCount > 0
            ? [
                {
                  id: `ml-${Date.now()}`,
                  date: today,
                  type: lossType,
                  count: lossCount,
                  reason:
                    lossReason.trim() ||
                    (lossType === 'CULL' ? 'คัดทิ้งประจำวัน' : 'บันทึกยอดตายประจำวัน'),
                },
                ...b.mortalityLogs,
              ]
            : b.mortalityLogs;

        return {
          ...b,
          currentDucks: nextDucks,
          mortalityDucks:
            lossType === 'MORTALITY' ? b.mortalityDucks + lossCount : b.mortalityDucks,
          culledDucks: lossType === 'CULL' ? b.culledDucks + lossCount : b.culledDucks,
          cumulativeFeedKg: Number(((b.cumulativeFeedKg || 0) + deductFeed).toFixed(1)),
          mortalityLogs: nextMortalityLogs,
        };
      }),
      feedSilos: prev.feedSilos.map((s) =>
        selectedSilo && s.id === selectedSilo.id && deductFeed > 0
          ? { ...s, remainingKg: Math.max(0, Number((s.remainingKg - deductFeed).toFixed(1))) }
          : s
      ),
      feedLogs:
        deductFeed > 0 && selectedSilo
          ? [
              {
                id: `fl-${Date.now()}`,
                date: today,
                barnId: selectedBarn.id,
                siloId: selectedSilo.id,
                amountKg: deductFeed,
                costThb: feedCost,
                autoDeducted: false,
                note: 'บันทึกประจำวัน (เบิกอาหาร + ยอดตาย + อุณหภูมิ)',
              },
              ...prev.feedLogs,
            ]
          : prev.feedLogs,
      environments: prev.environments.map((env) => {
        if (env.barnId !== selectedBarn.id) return env;
        const tempChanged = Math.abs(env.temperatureC - temperatureC) >= 0.1;
        return {
          ...env,
          temperatureC,
          autoAdjustLogs: tempChanged
            ? [
                {
                  id: `ba-${Date.now()}`,
                  timestamp: `${today} ${nowTime}`,
                  reason: 'บันทึกอุณหภูมิห้องกก/โรงเรือนจากฟอร์มประจำวัน',
                  prevTempC: env.temperatureC,
                  newTempC: temperatureC,
                  mode: 'MANUAL',
                },
                ...env.autoAdjustLogs,
              ]
            : env.autoAdjustLogs,
        };
      }),
    }));

    const parts: string[] = [];
    if (lossCount > 0) parts.push(`หักยอดเป็ด -${lossCount} ตัว`);
    if (deductFeed > 0 && selectedSilo) {
      parts.push(`ตัดสต็อก ${selectedSilo.name} -${deductFeed.toLocaleString()} กก.`);
    }
    parts.push(`อัปเดตอุณหภูมิ ${temperatureC}°C`);
    setSavedMsg(`บันทึกประจำวัน ${selectedBarn.name} เรียบร้อย (${parts.join(' · ')})`);
    setLossCount(0);
    setLossReason('');
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="pixel-wood-panel w-full max-w-2xl max-h-[88vh] flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="pixel-wood-header px-5 py-3.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <ClipboardPenLine className="w-5 h-5 text-amber-300 shrink-0" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#fff5dc]">
                บันทึกประจำวัน (Daily Farm Log)
              </h2>
              <p className="text-xs text-amber-200/90">
                กรอกยอดตาย เบิกอาหาร และอุณหภูมิห้องกกในฟอร์มเดียว · ตัดสต็อกและอัปเดตยอดอัตโนมัติ
              </p>
            </div>
          </div>
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

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4">
          {savedMsg && (
            <div className="bg-emerald-100 border-2 border-emerald-700 p-3 text-xs font-bold text-emerald-950 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
              <span>{savedMsg}</span>
            </div>
          )}

          {/* Barn Selector + Snapshot */}
          <div className="pixel-card p-3.5 space-y-2.5">
            <label className="font-bold text-xs text-[#4a2612] block">
              เลือกโรงเรือนที่ต้องการบันทึกวันนี้
            </label>
            <select
              value={barnId}
              onChange={(e) => {
                setBarnId(e.target.value);
                setSavedMsg(null);
              }}
              className="w-full bg-white border-2 border-[#723b18] px-3 py-2 text-sm font-bold text-[#3a1f0f]"
            >
              {farm.barns.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — คงเหลือ {b.currentDucks.toLocaleString()} ตัว (อายุ {b.currentCycleDay} วัน)
                </option>
              ))}
            </select>

            {selectedBarn && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-[#f3e1b9] px-3 py-2 border border-[#c68443] tabular-nums">
                <span>
                  เป็ดคงเหลือ:{' '}
                  <strong className="font-mono-num text-[#3a1f0f]">
                    {selectedBarn.currentDucks.toLocaleString()} ตัว
                  </strong>
                </span>
                <span>
                  อายุ:{' '}
                  <strong className="font-mono-num text-[#3a1f0f]">
                    {selectedBarn.currentCycleDay} วัน
                  </strong>
                </span>
                <span>
                  สูตรตามช่วงวัย:{' '}
                  <strong className="text-amber-900">
                    {expectedStageMeta.labelTh} ({expectedStageMeta.ageRangeTh})
                  </strong>
                </span>
              </div>
            )}

            {/* Age-based Feed Formula Transition Alert (Req 2) */}
            {barnFeedAlert && barnFeedAlert.severity !== 'ok' && (
              <div
                className={`p-2.5 border-2 text-xs font-bold flex items-start gap-2 ${
                  barnFeedAlert.severity === 'no_stock' || barnFeedAlert.severity === 'mismatch'
                    ? 'bg-amber-100 border-amber-700 text-amber-950'
                    : 'bg-sky-100 border-sky-700 text-sky-950'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>แจ้งเตือนสูตรอาหาร: {barnFeedAlert.message}</span>
              </div>
            )}
          </div>

          {/* 1. Mortality / Loss */}
          <div className="pixel-card p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skull className="w-4 h-4 text-rose-700" />
                <h3 className="font-display font-bold text-sm text-[#3a1f0f]">
                  1. ยอดเป็ดตาย / คัดทิ้งวันนี้
                </h3>
              </div>
              <span className="text-[11px] font-mono-num text-[#723b18]">
                สูงสุดไม่เกิน {currentDucks.toLocaleString()} ตัว
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="font-bold block mb-1">ประเภท</label>
                <select
                  value={lossType}
                  onChange={(e) => setLossType(e.target.value as 'MORTALITY' | 'CULL')}
                  className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-semibold"
                >
                  <option value="MORTALITY">ตาย (Mortality)</option>
                  <option value="CULL">คัดทิ้ง (Culled)</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">จำนวน (ตัว)</label>
                <input
                  type="number"
                  min={0}
                  max={currentDucks}
                  value={lossCount}
                  onChange={(e) => setLossCount(Math.max(0, Number(e.target.value)))}
                  className={`w-full bg-white border-2 px-2.5 py-1.5 font-mono-num font-bold ${
                    lossExceedsBarn || isAbnormalMortality
                      ? 'border-red-700 bg-red-50 text-red-900'
                      : 'border-[#723b18]'
                  }`}
                />
              </div>
              <div>
                <label className="font-bold block mb-1">สาเหตุ (ถ้ามี)</label>
                <input
                  type="text"
                  value={lossReason}
                  onChange={(e) => setLossReason(e.target.value)}
                  placeholder="เช่น ขาอ่อน, หนาว, ป่วย..."
                  className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                />
              </div>
            </div>

            {lossExceedsBarn && (
              <div className="bg-red-100 border-2 border-red-700 p-2.5 text-xs font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                <span>
                  ไม่สามารถบันทึกยอดเป็ดตาย/คัดทิ้งเกินจำนวนเป็ดที่มีอยู่ในโรงเรือน (
                  {currentDucks.toLocaleString()} ตัว)
                </span>
              </div>
            )}

            {/* Req 6: Immediate Red Alert Box when daily mortality > 1% */}
            {isAbnormalMortality && (
              <div
                role="alert"
                className="bg-[#dc2626] border-2 border-[#450a0a] text-white p-3 text-xs font-bold flex items-start gap-2.5 shadow-md"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-300 mt-0.5" />
                <div>
                  <div className="text-sm">
                    ยอดตายวันนี้สูงผิดปกติ ({dailyMortalityPct.toFixed(1)}%)
                  </div>
                  <div className="text-red-100 font-medium mt-0.5">
                    โปรดตรวจสอบอุณหภูมิ น้ำดื่ม หรืออาการป่วยของฝูง
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Feed Dispense */}
          <div className="pixel-card p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wheat className="w-4 h-4 text-amber-700" />
                <h3 className="font-display font-bold text-sm text-[#3a1f0f]">
                  2. น้ำหนักอาหารที่เบิกวันนี้ (ตัดสต็อกไซโลอัตโนมัติ)
                </h3>
              </div>
              {recommendedFeedKg > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    playPixelClick(muted);
                    setFeedKg(Math.min(siloRemainingKg, recommendedFeedKg));
                  }}
                  className="text-[11px] font-bold px-2 py-0.5 bg-amber-200 hover:bg-amber-300 border border-[#723b18] text-[#3a1f0f] cursor-pointer"
                >
                  ใช้ปริมาณแนะนำ ({recommendedFeedKg.toLocaleString()} กก.)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="font-bold block mb-1">เบิกจากไซโล</label>
                <select
                  value={siloId}
                  onChange={(e) => setSiloId(e.target.value)}
                  className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                >
                  {farm.feedSilos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (เหลือ {s.remainingKg.toLocaleString()} กก.)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">
                  น้ำหนักอาหารที่เบิก (กก.) · คงเหลือ {siloRemainingKg.toLocaleString()} กก.
                </label>
                <input
                  type="number"
                  min={0}
                  max={siloRemainingKg}
                  step="0.5"
                  value={feedKg}
                  onChange={(e) => setFeedKg(Math.max(0, Number(e.target.value)))}
                  className={`w-full bg-white border-2 px-2.5 py-1.5 font-mono-num font-bold ${
                    feedExceedsSilo ? 'border-red-700 bg-red-50 text-red-900' : 'border-[#723b18]'
                  }`}
                />
              </div>
            </div>

            {feedExceedsSilo && (
              <div className="bg-red-100 border-2 border-red-700 p-2.5 text-xs font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                <span>
                  ล็อกการเบิก: น้ำหนักอาหารที่กรอก ({feedKg.toLocaleString()} กก.)
                  เกินจำนวนคงเหลือในไซโล ({siloRemainingKg.toLocaleString()} กก.)
                </span>
              </div>
            )}

            {hasFormulaMismatch && selectedSiloFormula && (
              <div className="bg-amber-100 border-2 border-amber-700 p-2.5 text-xs font-bold text-amber-950 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
                <span>
                  สูตรอาหารไม่ตรงช่วงอายุ: เป็ดอายุ {selectedBarn?.currentCycleDay} วัน ควรใช้{' '}
                  {expectedStageMeta.labelTh} ({expectedStageMeta.ageRangeTh}) แต่กำลังเลือก{' '}
                  {FEED_STAGE_INFO[selectedSiloFormula.stage].labelTh}
                </span>
              </div>
            )}
          </div>

          {/* 3. Brooding / Barn Temperature */}
          <div className="pixel-card p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-sky-700" />
                <h3 className="font-display font-bold text-sm text-[#3a1f0f]">
                  3. อุณหภูมิห้องกก / โรงเรือน (°C)
                </h3>
              </div>
              {selectedEnv?.isBroodingBarn && (
                <span className="text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-700 px-2 py-0.5">
                  เล้ากก · เป้าหมาย {selectedEnv.brooderTargetTempC}°C
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs items-center">
              <div>
                <label className="font-bold block mb-1">อุณหภูมิที่วัดได้วันนี้ (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  min={10}
                  max={45}
                  value={temperatureC}
                  onChange={(e) => setTemperatureC(Number(e.target.value))}
                  className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num font-bold"
                />
              </div>
              <div className="text-[11px] text-[#5c2e14] bg-[#fff9eb] border border-[#c68443] p-2.5">
                {temperatureC < 26
                  ? 'อุณหภูมิค่อนข้างต่ำ ควรตรวจผ้าม่านกันลมและเปิดไฟกกเพิ่ม'
                  : temperatureC > 33
                    ? 'อุณหภูมิสูง ควรเปิดพัดลมระบายอากาศและตรวจน้ำดื่ม'
                    : 'ช่วงอุณหภูมิเหมาะสมสำหรับการเจริญเติบโตของเป็ดเนื้อ'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                playPixelClick(muted);
                onClose();
              }}
              className="pixel-btn bg-[#d9a462] hover:bg-[#c8914e] text-[#2b180e] text-xs font-bold px-4 py-2 cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            <button
              type="submit"
              disabled={isInvalid}
              className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-5 py-2 cursor-pointer"
            >
              บันทึกประจำวัน & ตัดสต็อกอัตโนมัติ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
