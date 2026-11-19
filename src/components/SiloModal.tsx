import React, { useState } from 'react';
import { X, Calculator, AlertTriangle, Plus, PackageCheck, Trash2 } from 'lucide-react';
import { Barn, FarmData, FeedSilo } from '../types/farm';
import {
  FEED_STAGE_INFO,
  getBarnFeedStageAlert,
  getFeedStageForAge,
  getRecommendedRationGramsPerDuck,
} from '../utils/livestockMetrics';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

interface SiloModalProps {
  farm: FarmData;
  onUpdateFarm: (updater: (prev: FarmData) => FarmData) => void;
  onClose: () => void;
  muted: boolean;
}

function daysBetween(startDateIso: string): number {
  const start = new Date(startDateIso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24)));
}

export const SiloModal: React.FC<SiloModalProps> = ({
  farm,
  onUpdateFarm,
  onClose,
  muted,
}) => {
  const [selectedBarnId, setSelectedBarnId] = useState(
    farm.barns.find((b) => b.status === 'ACTIVE')?.id || farm.barns[0]?.id || ''
  );
  const [selectedSiloId, setSelectedSiloId] = useState(farm.feedSilos[0]?.id || '');
  const [manualKg, setManualKg] = useState<number>(120);
  const [refillAmounts, setRefillAmounts] = useState<Record<string, number>>({});
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [showAddSiloForm, setShowAddSiloForm] = useState(false);
  const [newSiloName, setNewSiloName] = useState('');
  const [newSiloFormulaId, setNewSiloFormulaId] = useState(farm.feedFormulas[0]?.id || '');
  const [newSiloCapacityKg, setNewSiloCapacityKg] = useState<number>(3000);
  const [newSiloRemainingKg, setNewSiloRemainingKg] = useState<number>(1500);
  const [newSiloShelfLifeDays, setNewSiloShelfLifeDays] = useState<number>(30);
  const [confirmDeleteSiloId, setConfirmDeleteSiloId] = useState<string | null>(null);

  const totalRemainingKg = farm.feedSilos.reduce((s, f) => s + f.remainingKg, 0);
  const totalFeedCostAccumulated = farm.feedLogs.reduce((s, l) => s + l.costThb, 0);

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    window.setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleAutoDeductForBarn = (barn: Barn) => {
    if (barn.currentDucks <= 0) return;
    const { gramsPerDuck, stage } = getRecommendedRationGramsPerDuck(barn.currentCycleDay);
    const neededKg = Math.round((barn.currentDucks * gramsPerDuck) / 1000);

    const matchingFormula =
      farm.feedFormulas.find((f) => f.stage === stage) || farm.feedFormulas[0];
    const stageSilo = farm.feedSilos.find((s) => s.formulaId === matchingFormula?.id);

    if (!stageSilo || stageSilo.remainingKg < neededKg) {
      const avail = stageSilo ? stageSilo.remainingKg : 0;
      showFeedback(
        `ไม่สามารถหักอัตโนมัติได้: ${FEED_STAGE_INFO[stage].labelTh} คงเหลือ ${avail.toLocaleString()} กก. น้อยกว่าที่ต้องใช้ ${neededKg.toLocaleString()} กก.`
      );
      return;
    }

    const deductKg = neededKg;
    const costThb = Number((deductKg * (matchingFormula?.pricePerKg ?? 15.5)).toFixed(2));
    const today = new Date().toISOString().slice(0, 10);

    playSuccessChime(muted);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) =>
        b.id === barn.id
          ? { ...b, cumulativeFeedKg: Number(((b.cumulativeFeedKg || 0) + deductKg).toFixed(1)) }
          : b
      ),
      feedSilos: prev.feedSilos.map((s) =>
        s.id === stageSilo.id
          ? { ...s, remainingKg: Math.max(0, Number((s.remainingKg - deductKg).toFixed(1))) }
          : s
      ),
      feedLogs: [
        {
          id: `fl-${Date.now()}`,
          date: today,
          barnId: barn.id,
          siloId: stageSilo.id,
          amountKg: deductKg,
          costThb,
          autoDeducted: true,
          note: `หักอัตโนมัติ (${FEED_STAGE_INFO[stage].ageRangeTh}) ${gramsPerDuck} ก./ตัว/วัน × ${barn.currentDucks.toLocaleString()} ตัว`,
        },
        ...prev.feedLogs,
      ],
    }));

    showFeedback(
      `หักอาหารอัตโนมัติ ${deductKg.toLocaleString()} กก. (฿${costThb.toLocaleString()}) จาก ${stageSilo.name} สำหรับ ${barn.name}`
    );
  };

  const selectedBarnObj = farm.barns.find((b) => b.id === selectedBarnId) || null;
  const selectedSiloObj = farm.feedSilos.find((s) => s.id === selectedSiloId) || null;
  const selectedSiloFormula = selectedSiloObj
    ? farm.feedFormulas.find((f) => f.id === selectedSiloObj.formulaId) || null
    : null;
  const manualExceedsSilo =
    !selectedSiloObj || manualKg <= 0 || manualKg > selectedSiloObj.remainingKg;
  const manualStageMismatch =
    selectedBarnObj &&
    selectedBarnObj.currentDucks > 0 &&
    selectedSiloFormula &&
    selectedSiloFormula.stage !== getFeedStageForAge(selectedBarnObj.currentCycleDay);

  const stageAlerts = farm.barns
    .filter((b) => b.currentDucks > 0)
    .map((b) => getBarnFeedStageAlert(b, farm.feedSilos, farm.feedFormulas, farm.feedLogs))
    .filter((a) => a.severity !== 'ok');

  const handleManualFeedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const silo = farm.feedSilos.find((s) => s.id === selectedSiloId);
    const barn = farm.barns.find((b) => b.id === selectedBarnId);
    if (!silo || !barn || manualKg <= 0 || manualKg > silo.remainingKg) return;

    const formula = farm.feedFormulas.find((f) => f.id === silo.formulaId);
    const deductKg = manualKg;
    const costThb = Number((deductKg * (formula?.pricePerKg ?? 15)).toFixed(2));

    playSuccessChime(muted);
    onUpdateFarm((prev) => ({
      ...prev,
      barns: prev.barns.map((b) =>
        b.id === barn.id
          ? { ...b, cumulativeFeedKg: Number(((b.cumulativeFeedKg || 0) + deductKg).toFixed(1)) }
          : b
      ),
      feedSilos: prev.feedSilos.map((s) =>
        s.id === silo.id
          ? { ...s, remainingKg: Math.max(0, Number((s.remainingKg - deductKg).toFixed(1))) }
          : s
      ),
      feedLogs: [
        {
          id: `fl-${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          barnId: barn.id,
          siloId: silo.id,
          amountKg: deductKg,
          costThb,
          autoDeducted: false,
          note: 'บันทึกจ่ายอาหารด้วยตนเอง',
        },
        ...prev.feedLogs,
      ],
    }));

    showFeedback(`บันทึกการให้อาหาร ${deductKg.toLocaleString()} กก. ใน ${barn.name} แล้ว`);
  };

  const handleRefillSilo = (silo: FeedSilo) => {
    const addKg = refillAmounts[silo.id] ?? 1000;
    if (addKg <= 0) return;
    playPixelClick(muted);
    const today = new Date().toISOString().slice(0, 10);
    onUpdateFarm((prev) => ({
      ...prev,
      feedSilos: prev.feedSilos.map((s) =>
        s.id === silo.id
          ? {
              ...s,
              remainingKg: Math.min(s.capacityKg, s.remainingKg + addKg),
              storedDate: today,
            }
          : s
      ),
    }));
    showFeedback(`เติมอาหารเข้า ${silo.name} +${addKg.toLocaleString()} กก. และรีเซ็ตอายุจัดเก็บแล้ว`);
  };

  const handlePriceChange = (formulaId: string, nextPrice: number) => {
    onUpdateFarm((prev) => ({
      ...prev,
      feedFormulas: prev.feedFormulas.map((f) =>
        f.id === formulaId ? { ...f, pricePerKg: Math.max(0, nextPrice) } : f
      ),
    }));
  };

  const handleCreateSilo = (e: React.FormEvent) => {
    e.preventDefault();
    const formulaId = newSiloFormulaId || farm.feedFormulas[0]?.id || '';
    const formula = farm.feedFormulas.find((f) => f.id === formulaId);
    const capacityKg = Math.max(100, Number(newSiloCapacityKg) || 3000);
    const remainingKg = Math.max(0, Math.min(capacityKg, Number(newSiloRemainingKg) || 0));
    const maxShelfLifeDays = Math.max(7, Number(newSiloShelfLifeDays) || 30);
    const defaultLabel = formula
      ? `ไซโล ${farm.feedSilos.length + 1} (${FEED_STAGE_INFO[formula.stage].labelTh})`
      : `ไซโลที่ ${farm.feedSilos.length + 1}`;
    const newSilo: FeedSilo = {
      id: `silo-${Date.now()}`,
      name: newSiloName.trim() || defaultLabel,
      formulaId,
      capacityKg,
      remainingKg,
      storedDate: new Date().toISOString().slice(0, 10),
      maxShelfLifeDays,
    };

    playSuccessChime(muted);
    onUpdateFarm((prev) => ({
      ...prev,
      feedSilos: [...prev.feedSilos, newSilo],
    }));
    setSelectedSiloId(newSilo.id);
    setShowAddSiloForm(false);
    setNewSiloName('');
    showFeedback(`เพิ่ม "${newSilo.name}" เรียบร้อยแล้ว`);
  };

  const handleDeleteSilo = (silo: FeedSilo) => {
    if (farm.feedSilos.length <= 1) {
      showFeedback('ต้องมีไซโลอย่างน้อย 1 ถังในฟาร์ม');
      setConfirmDeleteSiloId(null);
      return;
    }
    playPixelClick(muted);
    const remainingSilos = farm.feedSilos.filter((s) => s.id !== silo.id);
    onUpdateFarm((prev) => ({
      ...prev,
      feedSilos: prev.feedSilos.filter((s) => s.id !== silo.id),
    }));
    if (selectedSiloId === silo.id) {
      setSelectedSiloId(remainingSilos[0]?.id || '');
    }
    setConfirmDeleteSiloId(null);
    showFeedback(`ลบไซโล "${silo.name}" แล้ว`);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="pixel-wood-panel w-full max-w-6xl max-h-[88vh] [@media(max-height:500px)]:max-h-[94vh] flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="pixel-wood-header px-3.5 sm:px-5 py-3 sm:py-3.5 [@media(max-height:500px)]:py-2 flex items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#fff5dc]">
              ไซโลอาหารเป็ด & สูตรอาหารคำนวณต้นทุนอัตโนมัติ
            </h2>
            <p className="text-xs text-amber-200/90 tabular-nums">
              อาหารคงเหลือรวม {totalRemainingKg.toLocaleString()} กก. · ต้นทุนอาหารสะสมที่จ่ายแล้ว ฿
              {totalFeedCostAccumulated.toLocaleString()}
            </p>
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

        {feedbackMsg && (
          <div className="bg-emerald-100 border-b-2 border-emerald-700 px-5 py-2 text-xs font-bold text-emerald-950 flex items-center gap-2">
            <PackageCheck className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-5 sm:space-y-6">
          {/* Feed Stage Transition Alerts (0-14 / 15-35 / 36+ days) */}
          {stageAlerts.length > 0 && (
            <div className="bg-amber-100 border-2 border-amber-800 p-3.5 space-y-1.5 text-xs">
              <div className="font-display font-bold text-sm text-amber-950 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>แจ้งเตือนเปลี่ยนสูตรอาหารตามช่วงอายุ (3 ระยะ: 0–14 วัน / 15–35 วัน / 36+ วัน)</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-amber-950 font-semibold">
                {stageAlerts.map((al) => (
                  <li key={al.barnId}>
                    <strong>{al.barnName}:</strong> {al.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Silo Management Header + Add Silo Form */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-display font-bold text-sm sm:text-base text-[#3a1f0f]">
                รายการไซโลอาหาร ({farm.feedSilos.length} ถัง)
              </div>
              <button
                type="button"
                onClick={() => {
                  playPixelClick(muted);
                  setShowAddSiloForm((v) => !v);
                }}
                className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white text-xs font-bold px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddSiloForm ? 'ยกเลิกเพิ่มไซโล' : 'เพิ่มไซโลใหม่'}
              </button>
            </div>

            {showAddSiloForm && (
              <form
                onSubmit={handleCreateSilo}
                className="pixel-card p-3.5 sm:p-4 space-y-3 bg-[#fff9eb]"
              >
                <div className="font-display font-bold text-sm text-[#3a1f0f]">
                  เพิ่มไซโลเก็บอาหารเป็ดใหม่
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                  <div className="lg:col-span-2">
                    <label className="font-bold block mb-1">ชื่อไซโล</label>
                    <input
                      type="text"
                      value={newSiloName}
                      onChange={(e) => setNewSiloName(e.target.value)}
                      placeholder={`เช่น ไซโล ${farm.feedSilos.length + 1} (เป็ดขุน)`}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">สูตรอาหาร</label>
                    <select
                      value={newSiloFormulaId}
                      onChange={(e) => setNewSiloFormulaId(e.target.value)}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                    >
                      {farm.feedFormulas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold block mb-1">ความจุ (กก.)</label>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={newSiloCapacityKg}
                      onChange={(e) => setNewSiloCapacityKg(Number(e.target.value))}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">คงเหลือเริ่มต้น (กก.)</label>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(100, newSiloCapacityKg)}
                      step={50}
                      value={newSiloRemainingKg}
                      onChange={(e) => setNewSiloRemainingKg(Number(e.target.value))}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <label className="font-bold">อายุจัดเก็บสูงสุด (วัน):</label>
                    <input
                      type="number"
                      min={7}
                      max={180}
                      value={newSiloShelfLifeDays}
                      onChange={(e) => setNewSiloShelfLifeDays(Number(e.target.value))}
                      className="w-20 bg-white border-2 border-[#723b18] px-2 py-1 font-mono-num"
                    />
                  </div>
                  <button
                    type="submit"
                    className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white font-bold px-4 py-1.5 cursor-pointer"
                  >
                    บันทึกเพิ่มไซโล
                  </button>
                </div>
              </form>
            )}

            {/* Silo Tank Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {farm.feedSilos.map((silo) => {
                const formula = farm.feedFormulas.find((f) => f.id === silo.formulaId);
                const fillPct = Math.min(100, Math.round((silo.remainingKg / silo.capacityKg) * 100));
                const storedDays = daysBetween(silo.storedDate);
                const nearExpiry = storedDays >= silo.maxShelfLifeDays - 7;
                const isConfirmingDelete = confirmDeleteSiloId === silo.id;

                return (
                  <div key={silo.id} className="pixel-card p-4 flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-sm text-[#3a1f0f] truncate">
                          {silo.name}
                        </h3>
                        <div className="text-xs text-[#723b18] mt-0.5">
                          ราคา ฿{formula?.pricePerKg.toFixed(2)}/กก. · โปรตีน {formula?.proteinPct}%
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 border whitespace-nowrap tabular-nums ${
                            nearExpiry
                              ? 'bg-amber-100 text-amber-900 border-amber-700'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-700'
                          }`}
                        >
                          เก็บมา {storedDays} วัน
                        </span>
                        <button
                          type="button"
                          disabled={farm.feedSilos.length <= 1}
                          onClick={() => {
                            playPixelClick(muted);
                            setConfirmDeleteSiloId(isConfirmingDelete ? null : silo.id);
                          }}
                          title={
                            farm.feedSilos.length <= 1
                              ? 'ต้องมีไซโลอย่างน้อย 1 ถัง'
                              : `ลบ ${silo.name}`
                          }
                          aria-label={`ลบ ${silo.name}`}
                          className="p-1.5 border border-rose-700/60 bg-rose-50 hover:bg-rose-100 disabled:opacity-35 disabled:cursor-not-allowed text-rose-800 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isConfirmingDelete && (
                      <div className="bg-rose-100 border-2 border-rose-700 p-2 text-xs flex items-center justify-between gap-2">
                        <span className="font-bold text-rose-950">ยืนยันลบไซโลนี้?</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteSiloId(null)}
                            className="px-2 py-0.5 bg-white border border-[#723b18] font-semibold cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSilo(silo)}
                            className="px-2 py-0.5 bg-rose-600 text-white border border-rose-900 font-bold cursor-pointer"
                          >
                            ลบไซโล
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Pixel Silo Fill Visualization */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-24 bg-slate-200 border-2 border-[#334155] relative overflow-hidden shrink-0 flex flex-col justify-end">
                        <div
                          className={`w-full transition-all duration-300 ${
                            fillPct < 20 ? 'bg-rose-500' : fillPct < 45 ? 'bg-amber-400' : 'bg-amber-500'
                          }`}
                          style={{ height: `${fillPct}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center font-mono-num text-[11px] font-bold text-slate-900">
                          {fillPct}%
                        </span>
                      </div>

                      <div className="space-y-1 text-xs tabular-nums flex-1">
                        <div className="font-mono-num text-xl font-bold text-[#3a1f0f]">
                          {silo.remainingKg.toLocaleString()} กก.
                        </div>
                        <div className="text-[#723b18]">ความจุ {silo.capacityKg.toLocaleString()} กก.</div>
                        <div className="text-[#5c2e14]">
                          นำเข้า: <span className="font-mono-num">{silo.storedDate}</span>
                        </div>
                        {nearExpiry && (
                          <div className="text-amber-800 font-semibold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>ใกล้ครบอายุจัดเก็บ {silo.maxShelfLifeDays} วัน</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[#e5cfa2]">
                      <input
                        type="number"
                        min={50}
                        step={50}
                        value={refillAmounts[silo.id] ?? 1000}
                        onChange={(e) =>
                          setRefillAmounts((prev) => ({
                            ...prev,
                            [silo.id]: Number(e.target.value),
                          }))
                        }
                        className="w-24 bg-white border-2 border-[#723b18] px-2 py-1 text-xs font-mono-num"
                      />
                      <button
                        type="button"
                        onClick={() => handleRefillSilo(silo)}
                        className="pixel-btn flex-1 bg-[#4ea832] hover:bg-[#429229] text-white text-xs font-bold py-1.5 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        เติมเข้าไซโล
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto-Deduct Ration & Manual Dispense */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 pixel-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-amber-800" />
                <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                  คำนวณและหักปริมาณอาหารรายวันอัตโนมัติแยกตามโรงเรือน
                </h3>
              </div>
              <p className="text-xs text-[#5c2e14]">
                คำนวณตามสูตรมาตรฐานเป็ดเนื้อ (อายุเป็ด × จำนวนเป็ดคงเหลือ) และหักออกจากไซโลพร้อมคิดต้นทุนทันที
              </p>

              <div className="space-y-2.5">
                {farm.barns
                  .filter((b) => b.currentDucks > 0)
                  .map((barn) => {
                    const { gramsPerDuck, stage } = getRecommendedRationGramsPerDuck(
                      barn.currentCycleDay
                    );
                    const stageMeta = FEED_STAGE_INFO[stage];
                    const recommendedKg = Math.round((barn.currentDucks * gramsPerDuck) / 1000);
                    const stageFormula = farm.feedFormulas.find((f) => f.stage === stage);
                    const stageSilo = farm.feedSilos.find((s) => s.formulaId === stageFormula?.id);
                    const hasEnoughStock = Boolean(stageSilo && stageSilo.remainingKg >= recommendedKg);

                    return (
                      <div
                        key={barn.id}
                        className="bg-[#fff9eb] border-2 border-[#c68443] p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-[#3a1f0f] text-sm">{barn.name}</div>
                          <div className="text-[#723b18] tabular-nums mt-0.5">
                            อายุ {barn.currentCycleDay} วัน →{' '}
                            <strong className="text-amber-900">
                              {stageMeta.labelTh} ({stageMeta.ageRangeTh})
                            </strong>{' '}
                            · {barn.currentDucks.toLocaleString()} ตัว × {gramsPerDuck} ก./ตัว ={' '}
                            <strong className="text-[#3a1f0f]">{recommendedKg.toLocaleString()} กก./วัน</strong>
                          </div>
                          {!hasEnoughStock && (
                            <div className="text-[11px] font-bold text-rose-700 mt-1">
                              สต็อกไซโลสูตรนี้ไม่พอ ({stageSilo ? `เหลือ ${stageSilo.remainingKg.toLocaleString()} กก.` : 'ยังไม่มีไซโลสูตรนี้'})
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!hasEnoughStock}
                          onClick={() => handleAutoDeductForBarn(barn)}
                          className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] disabled:opacity-50 disabled:cursor-not-allowed text-[#2b180e] font-bold px-3.5 py-2 cursor-pointer whitespace-nowrap"
                        >
                          หักอาหารวันนี้อัตโนมัติ (-{recommendedKg} กก.)
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

            <form onSubmit={handleManualFeedSubmit} className="lg:col-span-5 pixel-card p-4 space-y-3">
              <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                บันทึกการให้อาหารเพิ่มเติม (Manual)
              </h3>
              <div className="grid grid-cols-1 gap-2.5 text-xs">
                <div>
                  <label className="font-bold block mb-1">โรงเรือนที่ให้อาหาร</label>
                  <select
                    value={selectedBarnId}
                    onChange={(e) => setSelectedBarnId(e.target.value)}
                    className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                  >
                    {farm.barns.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">เบิกจากไซโล</label>
                  <select
                    value={selectedSiloId}
                    onChange={(e) => setSelectedSiloId(e.target.value)}
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
                    ปริมาณที่ให้ (กก.) · สูงสุด {selectedSiloObj ? selectedSiloObj.remainingKg.toLocaleString() : 0} กก.
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={selectedSiloObj?.remainingKg ?? 0}
                    value={manualKg}
                    onChange={(e) => setManualKg(Math.max(0, Number(e.target.value)))}
                    className={`w-full bg-white border-2 px-2.5 py-1.5 font-mono-num ${
                      selectedSiloObj && manualKg > selectedSiloObj.remainingKg
                        ? 'border-red-700 bg-red-50 text-red-900'
                        : 'border-[#723b18]'
                    }`}
                  />
                </div>
              </div>
              {selectedSiloObj && manualKg > selectedSiloObj.remainingKg && (
                <div className="bg-red-100 border-2 border-red-700 p-2 text-[11px] font-bold text-red-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-700" />
                  <span>
                    ล็อกการเบิก: ห้ามเบิกเกินคงเหลือในไซโล ({selectedSiloObj.remainingKg.toLocaleString()} กก.)
                  </span>
                </div>
              )}
              {manualStageMismatch && selectedBarnObj && selectedSiloFormula && (
                <div className="bg-amber-100 border-2 border-amber-700 p-2 text-[11px] font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                  <span>
                    สูตรไม่ตรงช่วงวัย: เป็ดอายุ {selectedBarnObj.currentCycleDay} วัน ควรใช้{' '}
                    {FEED_STAGE_INFO[getFeedStageForAge(selectedBarnObj.currentCycleDay)].labelTh}
                  </span>
                </div>
              )}
              <button
                type="submit"
                disabled={manualExceedsSilo}
                className="pixel-btn w-full bg-[#4ea832] hover:bg-[#429229] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold py-2 cursor-pointer"
              >
                บันทึกและหักสต็อกไซโล
              </button>
            </form>
          </div>

          {/* Feed Formulas & Ingredients + Price/kg */}
          <div className="pixel-card p-4 space-y-4">
            <h3 className="font-display font-bold text-base text-[#3a1f0f]">
              รายละเอียดสูตรอาหาร วัตถุดิบแต่ละช่วงวัย และราคาต่อกิโลกรัม
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {farm.feedFormulas.map((formula) => (
                <div
                  key={formula.id}
                  className="bg-[#fff9eb] border-2 border-[#c68443] p-3.5 space-y-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-sm text-[#3a1f0f]">{formula.name}</div>
                    <div className="text-[#723b18] mt-0.5 tabular-nums">
                      ช่วงวัย {formula.ageRangeDays} · โปรตีน {formula.proteinPct}% · {formula.energyKcalPerKg} kcal/kg
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[#f3e1b9] p-2 border border-[#c68443]">
                    <span className="font-bold text-[#4a2612]">ราคาอาหาร (บาท/กก.):</span>
                    <input
                      type="number"
                      step="0.1"
                      min={1}
                      value={formula.pricePerKg}
                      onChange={(e) => handlePriceChange(formula.id, Number(e.target.value))}
                      className="w-20 bg-white border-2 border-[#723b18] px-2 py-1 text-right font-mono-num font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-bold text-[#4a2612]">สัดส่วนวัตถุดิบหลัก</div>
                    {formula.ingredients.map((ing) => (
                      <div key={ing.name} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span>{ing.name}</span>
                          <span className="font-mono-num font-bold">{ing.percentage}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#e5cfa2] border border-[#8e4c1d]">
                          <div
                            className="h-full bg-[#d97706]"
                            style={{ width: `${ing.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dispense History Table */}
          <div className="pixel-card p-4 space-y-2">
            <h3 className="font-display font-bold text-base text-[#3a1f0f]">
              ประวัติการจ่ายอาหารล่าสุด ({farm.feedLogs.length})
            </h3>
            <div className="overflow-x-auto border-2 border-[#723b18] bg-white">
              <table className="w-full min-w-[640px] text-xs text-left border-collapse tabular-nums">
                <thead>
                  <tr className="border-b-2 border-[#8e4c1d] text-[#5c2e14]">
                    <th className="py-2 pr-3">วันที่</th>
                    <th className="py-2 pr-3">โรงเรือน</th>
                    <th className="py-2 pr-3">ไซโล</th>
                    <th className="py-2 pr-3 text-right">ปริมาณ (กก.)</th>
                    <th className="py-2 pr-3 text-right">มูลค่า (บาท)</th>
                    <th className="py-2">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {farm.feedLogs.slice(0, 12).map((log) => {
                    const bName = farm.barns.find((b) => b.id === log.barnId)?.name || log.barnId;
                    const sName = farm.feedSilos.find((s) => s.id === log.siloId)?.name || log.siloId;
                    return (
                      <tr key={log.id} className="border-b border-[#e5cfa2]">
                        <td className="py-2 pr-3 font-mono-num">{log.date}</td>
                        <td className="py-2 pr-3 font-semibold">{bName}</td>
                        <td className="py-2 pr-3">{sName}</td>
                        <td className="py-2 pr-3 text-right font-mono-num font-bold">
                          {log.amountKg.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono-num">
                          ฿{log.costThb.toLocaleString()}
                        </td>
                        <td className="py-2 text-[#5c2e14]">{log.note || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
