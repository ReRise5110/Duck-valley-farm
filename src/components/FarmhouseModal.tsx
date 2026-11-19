import React, { useEffect, useState } from 'react';
import {
  X,
  Thermometer,
  Droplets,
  Wind,
  Sun,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Fan,
} from 'lucide-react';
import { BarnEnvironment, BarnStatus, FarmData, HuddlingState } from '../types/farm';
import { PixelDuckSprite } from './PixelSprites';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

interface FarmhouseModalProps {
  farm: FarmData;
  onUpdateFarm: (updater: (prev: FarmData) => FarmData) => void;
  onClose: () => void;
  muted: boolean;
}

const BARN_STATUS_OPTIONS: Array<{ id: BarnStatus; label: string }> = [
  { id: 'ACTIVE', label: 'กำลังเลี้ยง (Active)' },
  { id: 'CLEANING', label: 'กำลังทำความสะอาด' },
  { id: 'DISINFECTING', label: 'พ่นยาฆ่าเชื้อ' },
  { id: 'RESTING', label: 'พักโรงเรือน (Downtime)' },
  { id: 'READY', label: 'พร้อมรับเป็ดล็อตใหม่' },
];

const HUDDLING_META: Record<
  HuddlingState,
  { title: string; advice: string; badgeClass: string }
> = {
  OPTIMAL: {
    title: 'กระจายตัวสม่ำเสมอ (สบายตัว)',
    advice: 'อุณหภูมิและลมในคอกกกเหมาะสม ลูกเป็ดกินน้ำ-กินอาหารปกติ',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-700',
  },
  HUDDLING_COLD: {
    title: 'เกาะกลุ่มแน่นใต้โคมกก (ลูกเป็ดหนาว!)',
    advice: 'ตรวจพบลูกเป็ดเบียดตัวติดกันมาก แสดงว่าหนาว ควรเพิ่มอุณหภูมิเครื่องกกทันที',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-700',
  },
  DISPERSED_HOT: {
    title: 'กระจายหนีชิดขอบคอก (ร้อนเกินไป)',
    advice: 'ลูกเป็ดหอบและถอยห่างจากหลอดไฟกก ควรลดกำลังไฟกกหรือเพิ่มการระบายอากาศ',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-700',
  },
  DRAFT_SIDE: {
    title: 'รวมตัวหลบมุมเดียว (มีลมโกรก)',
    advice: 'พบลมเย็นพัดผ่านเข้าคอกด้านหนึ่ง ควรปิดม่านบังลมด้านข้าง',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-700',
  },
};

export const FarmhouseModal: React.FC<FarmhouseModalProps> = ({
  farm,
  onUpdateFarm,
  onClose,
  muted,
}) => {
  const [selectedBarnId, setSelectedBarnId] = useState(
    farm.environments.find((e) => e.isBroodingBarn)?.barnId || farm.barns[0]?.id || ''
  );
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null);

  const selectedBarn = farm.barns.find((b) => b.id === selectedBarnId) || farm.barns[0];
  const env =
    farm.environments.find((e) => e.barnId === selectedBarn?.id) || farm.environments[0];

  const updateEnv = (barnId: string, patch: Partial<BarnEnvironment>) => {
    onUpdateFarm((prev) => ({
      ...prev,
      environments: prev.environments.map((e) =>
        e.barnId === barnId ? { ...e, ...patch } : e
      ),
    }));
  };

  // Live Auto-Brooder countdown when ducklings are huddling cold
  useEffect(() => {
    if (!env || !env.isBroodingBarn || !env.brooderEnabled) {
      setCountdownLeft(null);
      return;
    }

    if (env.huddlingState !== 'HUDDLING_COLD' || !env.autoBrooderEnabled || !env.lastHuddlingDetectedAt) {
      setCountdownLeft(null);
      return;
    }

    const interval = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - env.lastHuddlingDetectedAt!) / 1000);
      const remaining = env.autoBrooderGraceSeconds - elapsedSec;

      if (remaining <= 0) {
        window.clearInterval(interval);
        setCountdownLeft(null);
        const nextTarget = Math.min(36, Number((env.brooderTargetTempC + 2).toFixed(1)));
        const nextPower = Math.min(100, env.brooderPowerPct + 15);
        playSuccessChime(muted);

        onUpdateFarm((prev) => ({
          ...prev,
          environments: prev.environments.map((item) => {
            if (item.barnId !== env.barnId) return item;
            return {
              ...item,
              brooderTargetTempC: nextTarget,
              brooderPowerPct: nextPower,
              temperatureC: Number((item.temperatureC + 1.8).toFixed(1)),
              huddlingState: 'OPTIMAL',
              lastHuddlingDetectedAt: null,
              autoAdjustLogs: [
                {
                  id: `ba-${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                  reason: `ลูกเป็ดเกาะกลุ่มหนาวเกิน ${item.autoBrooderGraceSeconds} วินาทีโดยไม่มีผู้ปรับ จึงปรับเครื่องกกอัตโนมัติ`,
                  prevTempC: item.brooderTargetTempC,
                  newTempC: nextTarget,
                  mode: 'AUTO',
                },
                ...item.autoAdjustLogs,
              ],
            };
          }),
        }));
      } else {
        setCountdownLeft(remaining);
      }
    }, 400);

    return () => window.clearInterval(interval);
  }, [env, muted, onUpdateFarm]);

  const handleManualBrooderAdjust = (deltaTemp: number) => {
    if (!env) return;
    playPixelClick(muted);
    const nextTemp = Math.max(22, Math.min(36, Number((env.brooderTargetTempC + deltaTemp).toFixed(1))));
    const nextPower = Math.max(20, Math.min(100, env.brooderPowerPct + deltaTemp * 8));

    updateEnv(env.barnId, {
      brooderTargetTempC: nextTemp,
      brooderPowerPct: Math.round(nextPower),
      temperatureC: Number((env.temperatureC + deltaTemp * 0.7).toFixed(1)),
      huddlingState: 'OPTIMAL',
      lastHuddlingDetectedAt: null,
      autoAdjustLogs: [
        {
          id: `ba-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          reason: 'ผู้ดูแลปรับอุณหภูมิเครื่องกกด้วยตนเอง',
          prevTempC: env.brooderTargetTempC,
          newTempC: nextTemp,
          mode: 'MANUAL',
        },
        ...env.autoAdjustLogs,
      ],
    });
  };

  const handleSimulateHuddling = (state: HuddlingState) => {
    if (!env) return;
    playPixelClick(muted);
    updateEnv(env.barnId, {
      huddlingState: state,
      temperatureC: state === 'HUDDLING_COLD' ? 25.2 : state === 'DISPERSED_HOT' ? 34.5 : 30.0,
      lastHuddlingDetectedAt: state === 'HUDDLING_COLD' ? Date.now() : null,
    });
  };

  const handleBoostVentilation = () => {
    if (!env) return;
    playSuccessChime(muted);
    updateEnv(env.barnId, {
      windSpeedMs: Number(Math.min(3.5, env.windSpeedMs + 0.8).toFixed(1)),
      ammoniaPpm: Number(Math.max(4.0, env.ammoniaPpm - 7.5).toFixed(1)),
      humidityPct: Math.max(55, env.humidityPct - 6),
    });
  };

  if (!selectedBarn || !env) return null;

  const nh3Level =
    env.ammoniaPpm >= 20
      ? { label: 'อันตราย! แอมโมเนียสูงเกินเกณฑ์', color: 'bg-rose-100 text-rose-900 border-rose-700', bar: '#dc2626' }
      : env.ammoniaPpm >= 10
        ? { label: 'เฝ้าระวัง (ควรเพิ่มการระบายอากาศ)', color: 'bg-amber-100 text-amber-900 border-amber-700', bar: '#d97706' }
        : { label: 'คุณภาพอากาศดีมาก (ปกติ)', color: 'bg-emerald-100 text-emerald-900 border-emerald-700', bar: '#16a34a' };

  const huddlingMeta = HUDDLING_META[env.huddlingState];

  // Duckling coordinates inside brooder ring based on huddling state
  const ducklingPositions = Array.from({ length: 10 }, (_, idx) => {
    const angle = (idx / 10) * Math.PI * 2;
    if (env.huddlingState === 'HUDDLING_COLD') {
      const r = 10 + (idx % 3) * 9;
      return { x: 110 + Math.cos(angle) * r, y: 80 + Math.sin(angle) * r };
    }
    if (env.huddlingState === 'DISPERSED_HOT') {
      const r = 64 + (idx % 2) * 8;
      return { x: 110 + Math.cos(angle) * r, y: 80 + Math.sin(angle) * (r * 0.72) };
    }
    if (env.huddlingState === 'DRAFT_SIDE') {
      return { x: 42 + (idx % 4) * 16, y: 50 + Math.floor(idx / 4) * 20 };
    }
    const r = 34 + (idx % 3) * 12;
    return { x: 110 + Math.cos(angle) * r, y: 80 + Math.sin(angle) * (r * 0.78) };
  });

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-6 overflow-y-auto">
      <div className="pixel-wood-panel w-full max-w-6xl max-h-[88vh] [@media(max-height:500px)]:max-h-[94vh] flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="pixel-wood-header px-3.5 sm:px-5 py-3 sm:py-3.5 [@media(max-height:500px)]:py-2 flex items-center justify-between gap-3 sm:gap-4 shrink-0">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#fff5dc]">
              บ้านผู้ดูแลฟาร์ม · ระบบควบคุมสภาพแวดล้อม & Auto-Brooder
            </h2>
            <p className="text-xs text-amber-200/90">
              ตรวจสอบสถานะโรงเรือน ควบคุมแสง วัดแอมโมเนีย (NH3) และระบบกกอัตโนมัติสำหรับลูกเป็ด
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

        {/* Barn Selector Tabs */}
        <div className="bg-[#ebd2a2] border-b-2 border-[#8e4c1d] px-4 py-2.5 flex flex-wrap items-center gap-2 shrink-0">
          {farm.barns.map((barn) => {
            const bEnv = farm.environments.find((e) => e.barnId === barn.id);
            return (
              <button
                key={barn.id}
                type="button"
                onClick={() => {
                  playPixelClick(muted);
                  setSelectedBarnId(barn.id);
                }}
                className={`px-3 py-1.5 text-xs font-bold border-2 cursor-pointer flex items-center gap-2 ${
                  selectedBarn.id === barn.id
                    ? 'bg-[#e69128] text-[#2b180e] border-[#4a2612]'
                    : 'bg-[#fbf0d4] text-[#4a2612] border-[#8e4c1d] hover:bg-amber-100'
                }`}
              >
                <span>{barn.name}</span>
                {bEnv && bEnv.ammoniaPpm >= 15 && (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3.5 sm:p-5 overflow-y-auto flex-1 space-y-4 sm:space-y-5">
          {/* Top Row: Barn Status & Cleaning + Lighting System */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="pixel-card p-4 space-y-3">
              <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                สถานะโรงเรือนและรอบเตรียมความสะอาด ({selectedBarn.name})
              </h3>
              <div className="text-xs space-y-2.5">
                <div>
                  <label className="font-bold block mb-1">สถานะปัจจุบัน</label>
                  <select
                    value={selectedBarn.status}
                    onChange={(e) => {
                      const nextStatus = e.target.value as BarnStatus;
                      onUpdateFarm((prev) => ({
                        ...prev,
                        barns: prev.barns.map((b) =>
                          b.id === selectedBarn.id ? { ...b, status: nextStatus } : b
                        ),
                      }));
                    }}
                    className="w-full bg-white border-2 border-[#723b18] px-3 py-2 font-semibold"
                  >
                    {BARN_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3 space-y-2">
                  <div className="font-bold text-[#4a2612]">เช็คลิสต์เตรียมโรงเรือนก่อนลงเป็ดใหม่</div>
                  {[
                    { key: 'muckOut' as const, label: '1. กวาดและขนย้ายแกลบ/มูลเป็ดเก่าออกหมด' },
                    { key: 'washAndScrub' as const, label: '2. ล้างทำความสะอาดพื้น ผนัง และรางน้ำ' },
                    { key: 'disinfect' as const, label: '3. พ่นน้ำยาฆ่าเชื้อและโรยปูนขาวทั่วโรงเรือน' },
                  ].map((step) => (
                    <label key={step.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBarn.cleaningChecklist[step.key]}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          onUpdateFarm((prev) => ({
                            ...prev,
                            barns: prev.barns.map((b) =>
                              b.id === selectedBarn.id
                                ? {
                                    ...b,
                                    cleaningChecklist: {
                                      ...b.cleaningChecklist,
                                      [step.key]: checked,
                                    },
                                  }
                                : b
                            ),
                          }));
                        }}
                      />
                      <span>{step.label}</span>
                    </label>
                  ))}
                  <div className="flex items-center justify-between pt-1 border-t border-[#e5cfa2]">
                    <span>ระยะเวลาพักโรงเรือน (Downtime):</span>
                    <div className="flex items-center gap-1.5 font-mono-num">
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={selectedBarn.cleaningChecklist.restDaysCompleted}
                        onChange={(e) => {
                          const days = Number(e.target.value);
                          onUpdateFarm((prev) => ({
                            ...prev,
                            barns: prev.barns.map((b) =>
                              b.id === selectedBarn.id
                                ? {
                                    ...b,
                                    cleaningChecklist: {
                                      ...b.cleaningChecklist,
                                      restDaysCompleted: days,
                                    },
                                  }
                                : b
                            ),
                          }));
                        }}
                        className="w-14 bg-white border border-[#723b18] px-1.5 py-0.5 text-center"
                      />
                      <span>/ {selectedBarn.cleaningChecklist.targetRestDays} วัน</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Lighting Control */}
            <div className="pixel-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sun className="w-5 h-5 text-amber-600" />
                  <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                    ระบบควบคุมแสงสว่างโรงเรือน
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playPixelClick(muted);
                    updateEnv(env.barnId, { lightOn: !env.lightOn });
                  }}
                  className={`pixel-btn px-3 py-1 text-xs font-bold cursor-pointer ${
                    env.lightOn ? 'bg-amber-400 text-[#2b180e]' : 'bg-stone-300 text-stone-800'
                  }`}
                >
                  {env.lightOn ? 'ไฟเปิดอยู่ (ON)' : 'ไฟปิดอยู่ (OFF)'}
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span>ความเข้มแสง (Intensity)</span>
                    <span className="font-mono-num">
                      {env.lightOn ? env.lightIntensityPct : 0}% (~
                      {Math.round((env.lightOn ? env.lightIntensityPct : 0) * 0.45)} Lux)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={env.lightIntensityPct}
                    onChange={(e) =>
                      updateEnv(env.barnId, {
                        lightIntensityPct: Number(e.target.value),
                        lightOn: Number(e.target.value) > 0,
                      })
                    }
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold block mb-1">เวลาเปิดไฟอัตโนมัติ</label>
                    <input
                      type="time"
                      value={env.lightStartTime}
                      onChange={(e) => updateEnv(env.barnId, { lightStartTime: e.target.value })}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="font-bold block mb-1">เวลาปิดไฟอัตโนมัติ</label>
                    <input
                      type="time"
                      value={env.lightEndTime}
                      onChange={(e) => updateEnv(env.barnId, { lightEndTime: e.target.value })}
                      className="w-full bg-white border-2 border-[#723b18] px-2.5 py-1.5 font-mono-num"
                    />
                  </div>
                </div>

                <div
                  className="border-2 border-[#723b18] p-2.5 text-center font-semibold transition-colors"
                  style={{
                    backgroundColor: env.lightOn
                      ? `rgba(253, 224, 71, ${0.15 + (env.lightIntensityPct / 100) * 0.55})`
                      : '#334155',
                    color: env.lightOn ? '#3a1f0f' : '#f8fafc',
                  }}
                >
                  {env.lightOn
                    ? `จำลองแสงในโรงเรือน: ความสว่าง ${env.lightIntensityPct}% (ตั้งเวลา ${env.lightStartTime} - ${env.lightEndTime})`
                    : 'จำลองแสงในโรงเรือน: ช่วงมืดให้เป็ดพักผ่อน'}
                </div>
              </div>
            </div>
          </div>

          {/* Environment Telemetry + Ammonia Priority Monitor */}
          <div className="pixel-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                ตรวจวัดสภาพแวดล้อม & คุณภาพอากาศ (เน้นค่าก๊าซแอมโมเนีย NH3)
              </h3>
              <button
                type="button"
                onClick={handleBoostVentilation}
                className="pixel-btn bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
              >
                <Fan className="w-4 h-4" />
                เปิดพัดลมระบายอากาศลดแอมโมเนีย
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
              {/* Temperature */}
              <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#723b18]">
                  <span className="flex items-center gap-1.5">
                    <Thermometer className="w-4 h-4 text-rose-600" /> อุณหภูมิโรงเรือน
                  </span>
                  <span className="font-mono-num text-lg text-[#3a1f0f]">
                    {env.temperatureC.toFixed(1)} °C
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={38}
                  step={0.5}
                  value={env.temperatureC}
                  onChange={(e) => updateEnv(env.barnId, { temperatureC: Number(e.target.value) })}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <div className="text-[11px] text-[#5c2e14]">
                  เกณฑ์เหมาะสม: {env.isBroodingBarn ? '29 - 33°C (กกเล็ก)' : '24 - 29°C (เป็ดรุ่น/ขุน)'}
                </div>
              </div>

              {/* Humidity */}
              <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#723b18]">
                  <span className="flex items-center gap-1.5">
                    <Droplets className="w-4 h-4 text-sky-600" /> ความชื้นสัมพัทธ์
                  </span>
                  <span className="font-mono-num text-lg text-[#3a1f0f]">{env.humidityPct}% RH</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={95}
                  value={env.humidityPct}
                  onChange={(e) => updateEnv(env.barnId, { humidityPct: Number(e.target.value) })}
                  className="w-full accent-sky-600 cursor-pointer"
                />
                <div className="text-[11px] text-[#5c2e14]">เกณฑ์เหมาะสม: 60 - 70% RH</div>
              </div>

              {/* Wind Speed */}
              <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#723b18]">
                  <span className="flex items-center gap-1.5">
                    <Wind className="w-4 h-4 text-teal-600" /> ความเร็วลม
                  </span>
                  <span className="font-mono-num text-lg text-[#3a1f0f]">
                    {env.windSpeedMs.toFixed(1)} m/s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3.5}
                  step={0.1}
                  value={env.windSpeedMs}
                  onChange={(e) => updateEnv(env.barnId, { windSpeedMs: Number(e.target.value) })}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <div className="text-[11px] text-[#5c2e14]">
                  {env.isBroodingBarn ? 'ลูกเป็ดควร < 0.5 m/s' : 'เป็ดโต 1.5 - 2.5 m/s'}
                </div>
              </div>

              {/* Ammonia NH3 Priority Card */}
              <div className={`border-2 p-3 space-y-2 ${nh3Level.color}`}>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>ก๊าซแอมโมเนีย (NH3)</span>
                  <span className="font-mono-num text-lg">{env.ammoniaPpm.toFixed(1)} ppm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={35}
                  step={0.5}
                  value={env.ammoniaPpm}
                  onChange={(e) => updateEnv(env.barnId, { ammoniaPpm: Number(e.target.value) })}
                  className="w-full accent-amber-700 cursor-pointer"
                />
                <div className="w-full h-2 bg-white/80 border border-current">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.min(100, (env.ammoniaPpm / 35) * 100)}%`,
                      backgroundColor: nh3Level.bar,
                    }}
                  />
                </div>
                <div className="text-[11px] font-bold">{nh3Level.label}</div>
              </div>
            </div>
          </div>

          {/* Smart Brooder & Duckling Huddling Monitor */}
          <div className="pixel-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-600" />
                <div>
                  <h3 className="font-display font-bold text-base text-[#3a1f0f]">
                    ระบบเครื่องกก (Brooder) & ประเมินการเกาะกลุ่มของลูกเป็ดอัตโนมัติ
                  </h3>
                  <p className="text-xs text-[#5c2e14]">
                    หากลูกเป็ดเกาะกลุ่มแน่น (หนาว) และไม่มีการปรับด้วยตนเองภายในเวลาที่กำหนด ระบบจะเร่งความร้อนให้เอง
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold bg-[#fff9eb] px-3 py-1.5 border-2 border-[#723b18] cursor-pointer">
                <input
                  type="checkbox"
                  checked={env.isBroodingBarn}
                  onChange={(e) =>
                    updateEnv(env.barnId, {
                      isBroodingBarn: e.target.checked,
                      brooderEnabled: e.target.checked,
                    })
                  }
                />
                <span>เปิดใช้งานโหมดเล้ากกลูกเป็ดในโรงเรือนนี้</span>
              </label>
            </div>

            {env.isBroodingBarn ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Visual Top-Down Brooding Ring */}
                <div className="lg:col-span-5 bg-[#fff9eb] border-2 border-[#c68443] p-4 flex flex-col items-center justify-between gap-3">
                  <div className="w-full flex items-center justify-between text-xs">
                    <span className="font-bold text-[#4a2612]">มุมมองคอกกก (กล้องประเมินฝูง)</span>
                    <span className={`px-2 py-0.5 font-bold border ${huddlingMeta.badgeClass}`}>
                      {huddlingMeta.title}
                    </span>
                  </div>

                  <div className="relative w-[220px] h-[160px] bg-[#e5cfa2] border-4 border-[#723b18] rounded-full overflow-hidden flex items-center justify-center">
                    {/* Center Heat Lamp Glow */}
                    <div
                      className="absolute w-24 h-24 rounded-full pointer-events-none transition-opacity"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(251,146,60,0.65) 0%, rgba(251,146,60,0) 75%)',
                        opacity: env.brooderEnabled ? 0.4 + (env.brooderPowerPct / 100) * 0.6 : 0.1,
                      }}
                    />
                    <div className="absolute w-5 h-5 rounded-full bg-orange-500 border-2 border-[#4a2612] opacity-80" />
                    {ducklingPositions.map((pos, i) => (
                      <div
                        key={i}
                        className="absolute transition-all duration-500"
                        style={{ left: pos.x - 12, top: pos.y - 12 }}
                      >
                        <PixelDuckSprite variant="duckling" flip={i % 2 === 0} size={22} />
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-center text-[#5c2e14]">{huddlingMeta.advice}</p>

                  <div className="grid grid-cols-2 gap-1.5 w-full text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleSimulateHuddling('HUDDLING_COLD')}
                      className="px-2 py-1.5 bg-sky-100 hover:bg-sky-200 border border-sky-700 font-bold text-sky-900 cursor-pointer"
                    >
                      จำลอง: เกาะกลุ่มแน่น (หนาว)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulateHuddling('DISPERSED_HOT')}
                      className="px-2 py-1.5 bg-rose-100 hover:bg-rose-200 border border-rose-700 font-bold text-rose-900 cursor-pointer"
                    >
                      จำลอง: หนีขอบคอก (ร้อน)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulateHuddling('DRAFT_SIDE')}
                      className="px-2 py-1.5 bg-amber-100 hover:bg-amber-200 border border-amber-700 font-bold text-amber-900 cursor-pointer"
                    >
                      จำลอง: หลบลมมุมเดียว
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulateHuddling('OPTIMAL')}
                      className="px-2 py-1.5 bg-emerald-100 hover:bg-emerald-200 border border-emerald-700 font-bold text-emerald-900 cursor-pointer"
                    >
                      สถานะปกติ (กระจายตัวดี)
                    </button>
                  </div>
                </div>

                {/* Brooder Controls & Auto-Adjust Countdown */}
                <div className="lg:col-span-7 space-y-4">
                  {countdownLeft !== null && (
                    <div className="bg-amber-100 border-2 border-amber-700 p-3 flex items-center justify-between gap-3 animate-pulse">
                      <div className="text-xs font-bold text-amber-950">
                        ตรวจพบลูกเป็ดเกาะกลุ่มหนาว! หากไม่มีการปรับเอง ระบบจะเพิ่มอุณหภูมิ Brooder +2°C อัตโนมัติใน{' '}
                        <span className="font-mono-num text-base text-rose-700">
                          {countdownLeft} วินาที
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleManualBrooderAdjust(+2)}
                        className="pixel-btn bg-[#e69128] text-[#2b180e] text-xs font-bold px-3 py-1.5 shrink-0 cursor-pointer"
                      >
                        ปรับเองเดี๋ยวนี้ (+2°C)
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs tabular-nums">
                    <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3">
                      <div className="text-[#723b18] font-bold">อุณหภูมิเป้าหมายเครื่องกก</div>
                      <div className="font-mono-num text-2xl font-bold text-[#3a1f0f] my-1">
                        {env.brooderTargetTempC} °C
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleManualBrooderAdjust(-1)}
                          className="flex-1 bg-white border border-[#723b18] py-1 font-bold hover:bg-amber-100 cursor-pointer"
                        >
                          -1°C
                        </button>
                        <button
                          type="button"
                          onClick={() => handleManualBrooderAdjust(+1)}
                          className="flex-1 bg-white border border-[#723b18] py-1 font-bold hover:bg-amber-100 cursor-pointer"
                        >
                          +1°C
                        </button>
                      </div>
                    </div>

                    <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3">
                      <div className="text-[#723b18] font-bold">กำลังความร้อน (Heater)</div>
                      <div className="font-mono-num text-2xl font-bold text-orange-700 my-1">
                        {env.brooderPowerPct}%
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={env.brooderPowerPct}
                        onChange={(e) =>
                          updateEnv(env.barnId, { brooderPowerPct: Number(e.target.value) })
                        }
                        className="w-full accent-orange-600 cursor-pointer"
                      />
                    </div>

                    <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3 space-y-2">
                      <label className="flex items-center gap-2 font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={env.autoBrooderEnabled}
                          onChange={(e) =>
                            updateEnv(env.barnId, { autoBrooderEnabled: e.target.checked })
                          }
                        />
                        <span>ปรับอัตโนมัติเมื่อหนาว</span>
                      </label>
                      <div>
                        <label className="text-[11px] text-[#723b18] block">
                          รอผู้ดูแลก่อนปรับเอง (วินาที):
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={300}
                          value={env.autoBrooderGraceSeconds}
                          onChange={(e) =>
                            updateEnv(env.barnId, {
                              autoBrooderGraceSeconds: Math.max(5, Number(e.target.value)),
                            })
                          }
                          className="w-full bg-white border border-[#723b18] px-2 py-1 font-mono-num mt-0.5"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Adjustment History */}
                  <div className="bg-[#fff9eb] border-2 border-[#c68443] p-3 space-y-2">
                    <div className="font-bold text-xs text-[#4a2612]">
                      ประวัติการปรับเครื่องกก (อัตโนมัติและปรับเอง)
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 text-xs">
                      {env.autoAdjustLogs.length === 0 ? (
                        <p className="text-[#723b18]">ยังไม่มีบันทึกการปรับเครื่องกก</p>
                      ) : (
                        env.autoAdjustLogs.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-center justify-between gap-2 bg-[#f3e1b9] px-2.5 py-1.5 border border-[#c68443]"
                          >
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <span>
                                <strong className="font-mono-num mr-1.5">{log.timestamp}</strong>
                                [{log.mode === 'AUTO' ? 'ปรับอัตโนมัติ' : 'ปรับเอง'}] {log.reason}
                              </span>
                            </div>
                            <span className="font-mono-num font-bold text-orange-800 shrink-0">
                              {log.prevTempC}°C → {log.newTempC}°C
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#fff9eb] border-2 border-[#c68443] p-4 text-xs text-[#5c2e14]">
                โรงเรือนนี้เป็นโรงเรือนเป็ดรุ่น/ขุน (ไม่ได้ใช้เครื่องกก) — หากต้องการรับลูกเป็ดเล็กสามารถติ๊ก &ldquo;เปิดใช้งานโหมดเล้ากกลูกเป็ดในโรงเรือนนี้&rdquo; ด้านบนได้ทันที
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
