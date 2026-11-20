import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ActiveModalType, FarmData } from '../types/farm';
import {
  PixelBlackCatSprite,
  PixelDuckSprite,
  PixelFarmerSprite,
  PixelWorkerSprite,
} from './PixelSprites';
import {
  calculateFarmDailyFeedKg,
  calculateFarmOverviewMetrics,
  getBarnFeedStageAlert,
} from '../utils/livestockMetrics';
import { playCatMeow, playDuckQuack, playPixelClick, playPixelJump } from '../utils/soundFx';

interface FarmSceneProps {
  farm: FarmData;
  onOpenModal: (modal: ActiveModalType) => void;
  muted: boolean;
  modalOpen?: boolean;
}

type LandmarkId = 'BARN' | 'SILO' | 'FARMHOUSE' | 'SALES';
type BadgeSeverity = 'normal' | 'warning' | 'critical';

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const CAT_MESSAGES = [
  'เมี๊ยว~ ขอกอดหน่อยสิ!',
  'แง้ว! เล้าเป็ดสะอาดดีมาก',
  'เมี๊ยว... แอบดูเป็ดเล่นน้ำอยู่',
  'ครืดด~ อารมณ์ดีสุดๆ เลย',
  'เมี๊ยว! มีปลาทูแบ่งบ้างไหม?',
  'แง้ว~ วันนี้อากาศเย็นสบายจัง',
  'เมี๊ยว! ขอลูบหัวหน่อยน้า',
  'ฟ่อ! ไม่มีหนูมาใกล้เล้าแน่นอน',
  'เมี๊ยว~ เดินตรวจฟาร์มรอบที่ร้อย',
  'ง้าวว! แอบงีบใต้ต้นไม้แป๊บ',
];

function isGirlCollidingWithPond(x: number, y: number): boolean {
  // Pond footprint: x 82..345, y 414..574; girl feet/body footprint: [x+6..x+46, y+12..y+52]
  return x + 46 > 82 && x + 6 < 345 && y + 52 > 414 && y + 12 < 574;
}

export const FarmScene: React.FC<FarmSceneProps> = ({
  farm,
  onOpenModal,
  muted,
  modalOpen = false,
}) => {
  const [hovered, setHovered] = useState<LandmarkId | null>(null);
  const [duckBubble, setDuckBubble] = useState<{ id: number; text: string } | null>(null);
  const [workerBubble, setWorkerBubble] = useState<string | null>(null);
  const [catBubble, setCatBubble] = useState<string | null>(null);
  const catTimerRef = useRef<number | null>(null);

  // Controllable girl character state (WASD + Spacebar jump on computer)
  const [girlPos, setGirlPos] = useState<{ x: number; y: number }>({ x: 686, y: 228 });
  const [girlJumpZ, setGirlJumpZ] = useState(0);
  const [girlFacing, setGirlFacing] = useState<'left' | 'right'>('right');
  const [isGirlMoving, setIsGirlMoving] = useState(false);
  const keysPressedRef = useRef<Set<'W' | 'A' | 'S' | 'D'>>(new Set());
  const jumpZRef = useRef(0);
  const jumpVelRef = useRef(0);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (modalOpen) {
      keysPressedRef.current.clear();
      jumpZRef.current = 0;
      jumpVelRef.current = 0;
      setGirlJumpZ(0);
      setIsGirlMoving(false);
      return;
    }

    const JUMP_VELOCITY = 320;
    const GRAVITY = 1150;

    const mapKeyToDir = (e: KeyboardEvent): 'W' | 'A' | 'S' | 'D' | null => {
      switch (e.code) {
        case 'KeyW':
          return 'W';
        case 'KeyA':
          return 'A';
        case 'KeyS':
          return 'S';
        case 'KeyD':
          return 'D';
        default: {
          const k = e.key.toLowerCase();
          if (k === 'w') return 'W';
          if (k === 'a') return 'A';
          if (k === 's') return 'S';
          if (k === 'd') return 'D';
          return null;
        }
      }
    };

    const isEditableFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditableFocused()) return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat && jumpZRef.current === 0 && jumpVelRef.current === 0) {
          jumpVelRef.current = JUMP_VELOCITY;
          playPixelJump(mutedRef.current);
        }
        return;
      }

      const dir = mapKeyToDir(e);
      if (!dir) return;
      e.preventDefault();
      keysPressedRef.current.add(dir);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const dir = mapKeyToDir(e);
      if (!dir) return;
      keysPressedRef.current.delete(dir);
    };

    const handleBlur = () => {
      keysPressedRef.current.clear();
      setIsGirlMoving(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    let rafId = 0;
    let lastTime = performance.now();
    const SPEED_PX_PER_SEC = 230;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const keys = keysPressedRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.has('A')) dx -= 1;
      if (keys.has('D')) dx += 1;
      if (keys.has('W')) dy -= 1;
      if (keys.has('S')) dy += 1;

      if (dx !== 0 || dy !== 0) {
        if (dx !== 0 && dy !== 0) {
          const inv = 1 / Math.SQRT2;
          dx *= inv;
          dy *= inv;
        }
        if (dx < 0) setGirlFacing('left');
        else if (dx > 0) setGirlFacing('right');
        setIsGirlMoving(true);

        const stepX = dx * SPEED_PX_PER_SEC * dt;
        const stepY = dy * SPEED_PX_PER_SEC * dt;

        setGirlPos((prev) => {
          const candidateX = Math.max(20, Math.min(1128, prev.x + stepX));
          const resolvedX = isGirlCollidingWithPond(candidateX, prev.y) ? prev.x : candidateX;
          const candidateY = Math.max(152, Math.min(568, prev.y + stepY));
          const resolvedY = isGirlCollidingWithPond(resolvedX, candidateY) ? prev.y : candidateY;
          if (resolvedX === prev.x && resolvedY === prev.y) return prev;
          return { x: resolvedX, y: resolvedY };
        });
      } else {
        setIsGirlMoving((prev) => (prev ? false : prev));
      }

      // Vertical jump physics (Spacebar)
      if (jumpZRef.current > 0 || jumpVelRef.current > 0) {
        jumpVelRef.current -= GRAVITY * dt;
        const nextZ = jumpZRef.current + jumpVelRef.current * dt;
        if (nextZ <= 0) {
          jumpZRef.current = 0;
          jumpVelRef.current = 0;
          setGirlJumpZ(0);
        } else {
          jumpZRef.current = nextZ;
          setGirlJumpZ(nextZ);
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [modalOpen]);

  // Farm-wide overview metrics
  const totalDucks = farm.barns.reduce((sum, b) => sum + b.currentDucks, 0);
  const totalInitialDucks = farm.barns.reduce((sum, b) => sum + b.initialDucks, 0);
  const survivalPct =
    totalInitialDucks > 0 ? ((totalDucks / totalInitialDucks) * 100).toFixed(1) : '0.0';

  const overviewMetrics = calculateFarmOverviewMetrics(farm.barns);
  const avgFcr = overviewMetrics.fcr;

  const totalFeedKg = farm.feedSilos.reduce((sum, s) => sum + s.remainingKg, 0);
  const totalSiloCapacityKg = farm.feedSilos.reduce((sum, s) => sum + s.capacityKg, 0);
  const siloCapacityPct =
    totalSiloCapacityKg > 0 ? Math.round((totalFeedKg / totalSiloCapacityKg) * 100) : 0;

  const dailyFeedKg = calculateFarmDailyFeedKg(farm.barns);
  const feedDaysRemaining = dailyFeedKg > 0 ? totalFeedKg / dailyFeedKg : null;

  const totalNetProfit = farm.salesRecords.reduce((sum, r) => sum + r.netProfitThb, 0);

  // Per-building frontline status & alerts
  const activeBarns = farm.barns.filter((b) => b.currentDucks > 0);
  const maxAgeDay =
    activeBarns.length > 0 ? Math.max(...activeBarns.map((b) => b.currentCycleDay)) : 0;
  const harvestReadyBarns = activeBarns.filter(
    (b) => b.currentCycleDay >= 45 || b.currentCycleDay >= b.cycleDays
  );
  const harvestReadyDucks = harvestReadyBarns.reduce((sum, b) => sum + b.currentDucks, 0);

  const broodingEnv = farm.environments.find((e) => e.isBroodingBarn) || farm.environments[0];
  const broodingTemp = broodingEnv?.temperatureC ?? 28;
  const hasHighAmmonia = farm.environments.some((e) => e.ammoniaPpm >= 15);
  const hasColdHuddle = farm.environments.some((e) => e.huddlingState === 'HUDDLING_COLD');

  const todayIso = getLocalTodayIso();
  const todayVaccineCount = farm.calendarEvents.filter(
    (e) => e.category === 'VACCINE' && e.date === todayIso
  ).length;

  const latestSale = farm.salesRecords[farm.salesRecords.length - 1];

  // Floating capsule configs
  const barnBadge: { text: string; severity: BadgeSeverity } =
    harvestReadyDucks > 0
      ? {
          text: `อายุ ${maxAgeDay} วัน · พร้อมจับขาย`,
          severity: 'warning',
        }
      : activeBarns.length > 0
        ? {
            text: `อายุสูงสุด ${maxAgeDay} วัน · ${totalDucks.toLocaleString()} ตัว`,
            severity: 'normal',
          }
        : {
            text: 'ว่าง · รอรับลูกเป็ด',
            severity: 'normal',
          };

  const farmhouseBadge: { text: string; severity: BadgeSeverity } =
    todayVaccineCount > 0
      ? {
          text: `กก ${broodingTemp}°C · วัคซีนวันนี้ ${todayVaccineCount} คิว`,
          severity: 'critical',
        }
      : hasHighAmmonia || hasColdHuddle
        ? {
            text: `กก ${broodingTemp}°C · ${hasHighAmmonia ? 'NH₃ สูง' : 'ลูกเป็ดหนาว'}`,
            severity: 'warning',
          }
        : {
            text: `กก ${broodingTemp}°C · วัคซีนวันนี้ 0`,
            severity: 'normal',
          };

  const feedStageAlerts = activeBarns
    .map((b) => getBarnFeedStageAlert(b, farm.feedSilos, farm.feedFormulas, farm.feedLogs))
    .filter((a) => a.severity !== 'ok');

  const siloBadge: { text: string; severity: BadgeSeverity } =
    feedDaysRemaining !== null && feedDaysRemaining < 3
      ? {
          text: `ความจุ ${siloCapacityPct}% · เหลือ ${feedDaysRemaining.toFixed(1)} วัน`,
          severity: 'critical',
        }
      : feedStageAlerts.length > 0
        ? {
            text: `ความจุ ${siloCapacityPct}% · แจ้งเปลี่ยนสูตร`,
            severity: 'warning',
          }
        : siloCapacityPct <= 20
          ? {
              text: `ความจุ ${siloCapacityPct}% · ใกล้หมด`,
              severity: 'warning',
            }
          : {
              text: `ความจุคงเหลือ ${siloCapacityPct}%`,
              severity: 'normal',
            };

  const salesBadge: { text: string; severity: BadgeSeverity } =
    harvestReadyDucks > 0
      ? {
          text: `พร้อมส่งขาย ${harvestReadyDucks.toLocaleString()} ตัว`,
          severity: 'warning',
        }
      : {
          text: 'พร้อมส่งขาย 0 ตัว',
          severity: 'normal',
        };

  const getCapsuleClass = (severity: BadgeSeverity) => {
    if (severity === 'critical') {
      return 'bg-[#dc2626] text-white border-[#450a0a] shadow-[0_3px_0_rgba(69,10,10,0.65)]';
    }
    if (severity === 'warning') {
      return 'bg-[#fde047] text-[#3a1f0f] border-[#78350f] shadow-[0_3px_0_rgba(120,53,15,0.5)]';
    }
    return 'bg-[#fbf0d4]/95 text-[#3a1f0f] border-[#723b18] shadow-[0_3px_0_rgba(74,38,18,0.38)]';
  };

  const triggerDuckGimmick = (id: number, text: string) => {
    playDuckQuack(muted);
    setDuckBubble({ id, text });
    window.setTimeout(() => {
      setDuckBubble((curr) => (curr?.id === id ? null : curr));
    }, 2200);
  };

  const triggerWorkerGimmick = () => {
    playPixelClick(muted);
    const messages = [
      'กำลังตรวจเล้าและเติมอาหารครับ!',
      'เช็กน้ำดื่มและอุณหภูมิเรียบร้อย!',
      'ฝูงเป็ดแข็งแรงดีทุกโรงเรือนเลย!',
    ];
    const nextMsg = messages[Math.floor(Math.random() * messages.length)];
    setWorkerBubble(nextMsg);
    window.setTimeout(() => {
      setWorkerBubble((curr) => (curr === nextMsg ? null : curr));
    }, 2400);
  };

  const triggerCatGimmick = () => {
    playCatMeow(muted);
    const candidates = CAT_MESSAGES.filter((m) => m !== catBubble);
    const pool = candidates.length > 0 ? candidates : CAT_MESSAGES;
    const nextMsg = pool[Math.floor(Math.random() * pool.length)];
    setCatBubble(nextMsg);
    if (catTimerRef.current) {
      window.clearTimeout(catTimerRef.current);
    }
    catTimerRef.current = window.setTimeout(() => {
      setCatBubble(null);
      catTimerRef.current = null;
    }, 2600);
  };

  const handleSelectLandmark = (modal: ActiveModalType) => {
    playPixelClick(muted);
    onOpenModal(modal);
  };

  return (
    <div className="relative w-full h-full min-h-0 pb-24 lg:pb-0 [@media(max-height:500px)]:pb-12 flex items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#68bef2_0%,#89d3fa_15%,#6bb844_19%,#5aa838_100%)]">
      {/* Top-Left Sky Overlay: Farm-Wide Macro KPIs */}
      <div className="pointer-events-none absolute top-2 left-2 right-2 md:right-auto md:top-3 md:left-3 [@media(max-height:500px)]:top-1.5 [@media(max-height:500px)]:left-2 z-20">
        <div className="pointer-events-auto grid grid-cols-2 md:flex md:flex-wrap [@media(max-height:500px)]:flex [@media(max-height:500px)]:flex-wrap items-center gap-x-3 lg:gap-x-4 [@media(max-height:500px)]:gap-x-2.5 gap-y-1 md:gap-y-1.5 w-fit max-w-full bg-[#fbf0d4]/92 backdrop-blur-[2px] border-2 border-[#4a2612] px-2.5 py-1 lg:px-3 lg:py-1.5 [@media(max-height:500px)]:px-2 [@media(max-height:500px)]:py-0.5 shadow-[0_3px_0_rgba(35,16,7,0.38)]">
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] md:text-[10px] font-semibold text-[#7c3f16]">เป็ดคงเหลือ (% รอด)</span>
            <span className="font-mono-num text-[11px] md:text-sm font-bold text-[#3a1f0f]">
              {totalDucks.toLocaleString()} ตัว{' '}
              <span className="text-emerald-700">({survivalPct}%)</span>
            </span>
          </div>

          <div className="hidden md:block w-px h-6 bg-[#c68443]/60" />

          <div className="flex flex-col leading-tight">
            <span className="text-[9px] md:text-[10px] font-semibold text-[#7c3f16]">
              {overviewMetrics.fcrStatus === 'FINAL' ? 'FCR ปิดรุ่น' : 'FCR คาดการณ์'}
            </span>
            <span className="font-mono-num text-[11px] md:text-sm font-bold text-[#3a1f0f]">
              {avgFcr > 0 ? avgFcr.toFixed(2) : '—'}
            </span>
          </div>

          <div className="hidden md:block w-px h-6 bg-[#c68443]/60" />

          <div className="flex flex-col leading-tight">
            <span className="text-[9px] md:text-[10px] font-semibold text-[#7c3f16]">อาหารพอใช้</span>
            <span
              className={`font-mono-num text-[11px] md:text-sm font-bold ${
                feedDaysRemaining !== null && feedDaysRemaining < 3
                  ? 'text-red-700'
                  : 'text-[#3a1f0f]'
              }`}
            >
              {feedDaysRemaining !== null ? `${Math.floor(feedDaysRemaining)} วัน` : '—'}
            </span>
          </div>

          <div className="hidden md:block w-px h-6 bg-[#c68443]/60" />

          <div className="flex flex-col leading-tight">
            <span className="text-[9px] md:text-[10px] font-semibold text-[#7c3f16]">กำไรสุทธิสะสม</span>
            <span
              className={`font-mono-num text-[11px] md:text-sm font-bold ${
                totalNetProfit > 0
                  ? 'text-emerald-700'
                  : totalNetProfit < 0
                    ? 'text-red-700'
                    : 'text-[#3a1f0f]'
              }`}
            >
              {totalNetProfit > 0 ? '+' : totalNetProfit < 0 ? '-' : ''}฿
              {Math.abs(totalNetProfit).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 16-bit SNES / Stardew-style Pixel Scene SVG (Mobile landscape fits cleanly, tablet portrait pans smoothly, tablet landscape & desktop fit full view) */}
      <div className="w-full h-full overflow-x-auto md:overflow-hidden [@media(min-width:768px)_and_(max-width:1023px)_and_(orientation:portrait)]:overflow-x-auto [@media(max-height:500px)]:overflow-hidden scrollbar-none flex items-center justify-start md:justify-center [@media(min-width:768px)_and_(max-width:1023px)_and_(orientation:portrait)]:justify-start [@media(max-height:500px)]:justify-center">
        <svg
          viewBox="0 0 1200 660"
          preserveAspectRatio="xMidYMid meet"
          className="min-w-[880px] md:min-w-0 [@media(min-width:768px)_and_(max-width:1023px)_and_(orientation:portrait)]:min-w-[960px] [@media(max-height:500px)]:min-w-0 w-full h-full select-none shrink-0 overflow-visible"
          shapeRendering="crispEdges"
        >
        <defs>
          <pattern id="grassPattern16" width="32" height="32" patternUnits="userSpaceOnUse">
            <rect width="32" height="32" fill="#6bb844" />
            <rect x="0" y="0" width="16" height="16" fill="#65b03e" />
            <rect x="4" y="6" width="4" height="4" fill="#589e34" />
            <rect x="20" y="20" width="4" height="4" fill="#79c94f" />
            <rect x="10" y="24" width="4" height="4" fill="#589e34" />
            <rect x="24" y="4" width="4" height="4" fill="#79c94f" />
          </pattern>
          <pattern id="dirtPath16" width="32" height="32" patternUnits="userSpaceOnUse">
            <rect width="32" height="32" fill="#dea764" />
            <rect x="2" y="4" width="8" height="4" fill="#cf934c" />
            <rect x="16" y="14" width="8" height="4" fill="#eab777" />
            <rect x="6" y="24" width="6" height="4" fill="#c6863f" />
            <rect x="22" y="26" width="6" height="4" fill="#cf934c" />
          </pattern>
          <pattern id="waterPattern16" width="32" height="32" patternUnits="userSpaceOnUse">
            <rect width="32" height="32" fill="#3a9ee0" />
            <rect x="4" y="6" width="10" height="4" fill="#63beff" />
            <rect x="18" y="20" width="10" height="4" fill="#63beff" />
            <rect x="10" y="26" width="6" height="4" fill="#2d88c8" />
          </pattern>
        </defs>

        {/* 16-bit Layered Sky (Extended seamlessly for widescreen & tall displays) */}
        <rect x="-600" y="-400" width="2400" height="456" fill="#68bef2" />
        <rect x="-600" y="56" width="2400" height="32" fill="#89d3fa" />
        <rect x="-600" y="88" width="2400" height="24" fill="#b3e7fd" />

        {/* Distant 16-bit Pixel Mountains */}
        <path
          d="M-600 112 L-420 74 L-210 112 L0 112 L130 68 L280 112 L460 72 L640 112 L840 64 L1030 112 L1200 78 L1420 112 L1620 70 L1800 112 Z"
          fill="#4a8d40"
        />
        <path
          d="M-500 112 L-310 82 L-140 112 L70 112 L190 80 L320 112 L520 82 L680 112 L900 78 L1100 112 L1310 80 L1540 112 Z"
          fill="#3d7a34"
        />
        <rect x="-600" y="108" width="2400" height="8" fill="#326829" />

        {/* Animated 16-bit Pixel Clouds */}
        <g className="animate-cloud-slow">
          <rect x="40" y="24" width="80" height="20" fill="#ffffff" />
          <rect x="56" y="12" width="44" height="12" fill="#ffffff" />
          <rect x="40" y="40" width="80" height="4" fill="#cceeff" />
        </g>
        <g className="animate-cloud-fast">
          <rect x="340" y="40" width="68" height="16" fill="#ffffff" />
          <rect x="356" y="30" width="36" height="10" fill="#ffffff" />
          <rect x="340" y="52" width="68" height="4" fill="#cceeff" />
        </g>

        {/* Main 16-bit Farm Grass Terrain (Extended seamlessly) */}
        <rect x="-600" y="112" width="2400" height="1000" fill="url(#grassPattern16)" />

        {/* Top Wooden Perimeter Fence (Extended seamlessly across viewport) */}
        {Array.from({ length: 49 }, (_, idx) => {
          const i = idx - 12;
          return (
            <g key={`fence-top-${i}`} transform={`translate(${i * 48}, 116)`}>
              <rect x="0" y="8" width="48" height="6" fill="#a8622b" />
              <rect x="0" y="12" width="48" height="2" fill="#82461a" />
              <rect x="0" y="20" width="48" height="6" fill="#945220" />
              <rect x="6" y="0" width="10" height="32" fill="#bd7338" />
              <rect x="14" y="0" width="2" height="32" fill="#7c4218" />
              <rect x="6" y="0" width="8" height="4" fill="#df9757" />
            </g>
          );
        })}

        {/* 16-bit Golden Dirt Paths with Soft Shaded Edges */}
        <rect x="190" y="348" width="840" height="56" fill="url(#dirtPath16)" />
        <rect x="190" y="344" width="840" height="4" fill="#b77b38" />
        <rect x="190" y="404" width="840" height="4" fill="#b77b38" />
        <rect x="560" y="274" width="72" height="184" fill="url(#dirtPath16)" />
        <rect x="240" y="278" width="72" height="86" fill="url(#dirtPath16)" />
        <rect x="880" y="294" width="72" height="184" fill="url(#dirtPath16)" />

        {/* 16-bit Stone Wall Enclosure (Tone-on-tone slate blocks) */}
        <rect x="400" y="440" width="180" height="16" fill="#94a3b8" />
        <rect x="400" y="452" width="180" height="4" fill="#64748b" />
        <rect x="404" y="444" width="28" height="6" fill="#cbd5e1" />
        <rect x="444" y="444" width="28" height="6" fill="#cbd5e1" />
        <rect x="484" y="444" width="28" height="6" fill="#cbd5e1" />
        <rect x="524" y="444" width="28" height="6" fill="#cbd5e1" />
        <rect x="400" y="440" width="16" height="130" fill="#94a3b8" />
        <rect x="412" y="440" width="4" height="130" fill="#64748b" />

        {/* 16-bit Sunflowers & Pumpkins Patch */}
        {[0, 1, 2, 3, 4].map((idx) => (
          <g key={`sunflower-${idx}`} transform={`translate(${426 + idx * 30}, 468)`}>
            <rect x="8" y="14" width="4" height="14" fill="#2e7d32" />
            <rect x="4" y="18" width="6" height="4" fill="#4caf50" />
            <rect x="10" y="20" width="6" height="4" fill="#4caf50" />
            <rect x="4" y="2" width="12" height="12" fill="#facc15" />
            <rect x="4" y="12" width="12" height="2" fill="#ca8a04" />
            <rect x="7" y="5" width="6" height="6" fill="#92400e" />
          </g>
        ))}
        {[0, 1, 2, 3].map((idx) => (
          <g key={`pumpkin-${idx}`} transform={`translate(${434 + idx * 34}, 516)`}>
            <rect x="10" y="0" width="4" height="5" fill="#15803d" />
            <rect x="2" y="5" width="20" height="16" fill="#ea580c" />
            <rect x="4" y="5" width="16" height="14" fill="#f97316" />
            <rect x="8" y="5" width="8" height="14" fill="#fb923c" />
            <rect x="2" y="19" width="20" height="2" fill="#9a3412" />
          </g>
        ))}

        {/* 16-bit Layered Apple Trees (No heavy borders) */}
        {[
          { x: 46, y: 152 },
          { x: 1080, y: 162 },
          { x: 54, y: 455 },
        ].map((tree, idx) => (
          <g key={`tree-${idx}`} transform={`translate(${tree.x}, ${tree.y})`}>
            <ellipse cx="37" cy="96" rx="28" ry="8" fill="#3a7123" opacity="0.55" />
            <rect x="28" y="62" width="18" height="34" fill="#854d22" />
            <rect x="40" y="62" width="6" height="34" fill="#633513" />
            <rect x="8" y="20" width="58" height="44" fill="#256d2c" />
            <rect x="14" y="10" width="46" height="46" fill="#358f3b" />
            <rect x="20" y="14" width="32" height="30" fill="#4ab04f" />
            <rect x="18" y="26" width="8" height="8" fill="#ef4444" />
            <rect x="18" y="26" width="4" height="4" fill="#fca5a5" />
            <rect x="44" y="34" width="8" height="8" fill="#ef4444" />
            <rect x="30" y="18" width="8" height="8" fill="#ef4444" />
          </g>
        ))}

        {/* 16-bit Cozy Duck Pond */}
        <g transform="translate(86, 422)">
          <rect x="-4" y="-4" width="263" height="156" rx="24" fill="#735531" />
          <rect x="0" y="0" width="255" height="148" rx="20" fill="url(#waterPattern16)" />
          <rect x="8" y="6" width="239" height="136" rx="16" fill="none" stroke="#8ad9ff" strokeWidth="4" opacity="0.5" />
          {/* Lilypads */}
          <rect x="40" y="36" width="24" height="16" fill="#3fa34d" />
          <rect x="44" y="36" width="16" height="8" fill="#60c46c" />
          <rect x="190" y="100" width="28" height="18" fill="#3fa34d" />
          <rect x="198" y="96" width="8" height="6" fill="#f472b6" />
          {/* Wooden Dock */}
          <rect x="108" y="-8" width="44" height="28" fill="#bd7338" />
          <rect x="108" y="16" width="44" height="4" fill="#7c4218" />
          <rect x="108" y="2" width="44" height="2" fill="#8f5122" />
          <rect x="108" y="10" width="44" height="2" fill="#8f5122" />
        </g>

        {/* ============================================================ */}
        {/* ICON 1: โรงเรือนเป็ด 16-bit (Outer position wrapper + Inner hover hop) */}
        {/* ============================================================ */}
        <g transform="translate(150, 148)">
          <g
            className="landmark-group"
            tabIndex={0}
            role="button"
            aria-label="เปิดข้อมูลโรงเรือนเป็ดและปฏิทิน"
            onMouseEnter={() => setHovered('BARN')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleSelectLandmark('BARN')}
            onKeyDown={(e) => e.key === 'Enter' && handleSelectLandmark('BARN')}
          >
            {/* Floating Capsule Badge Above Roof (Hidden on mobile & short phone landscape) */}
            <foreignObject x="-40" y="-32" width="300" height="32" overflow="visible">
              <div className="hidden md:flex [@media(max-height:500px)]:hidden items-center justify-center w-full h-full">
                <span
                  className={`px-2.5 py-1 rounded-full border-2 text-[11px] font-bold leading-none whitespace-nowrap flex items-center gap-1.5 ${getCapsuleClass(
                    barnBadge.severity
                  )}`}
                >
                  {barnBadge.severity !== 'normal' && (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{barnBadge.text}</span>
                </span>
              </div>
            </foreignObject>

            {/* Soft grass shadow */}
            <ellipse cx="110" cy="148" rx="98" ry="12" fill="#3f7c25" opacity="0.55" />
            {/* Barn Wall (Warm cream timber with tone-on-tone shading) */}
            <rect x="22" y="58" width="176" height="88" fill="#f2d6a0" />
            <rect x="22" y="138" width="176" height="8" fill="#cfa86a" />
            <rect x="22" y="58" width="8" height="88" fill="#dfc087" />
            <rect x="190" y="58" width="8" height="88" fill="#cfa86a" />
            {/* Vertical plank seams */}
            <rect x="50" y="64" width="2" height="74" fill="#dfbe83" />
            <rect x="168" y="64" width="2" height="74" fill="#dfbe83" />
            {/* 16-bit Terracotta Shingled Roof (No harsh outline) */}
            <polygon points="8,62 110,8 212,62" fill="#992e1b" />
            <polygon points="16,58 110,12 204,58" fill="#c9432b" />
            <polygon points="28,54 110,16 192,54" fill="#df553b" />
            {/* Roof shingle pixel steps */}
            <rect x="52" y="38" width="116" height="4" fill="#b53722" />
            <rect x="74" y="26" width="72" height="4" fill="#b53722" />
            {/* Loft Window */}
            <rect x="94" y="28" width="32" height="22" fill="#992e1b" />
            <rect x="98" y="32" width="24" height="14" fill="#fde68a" />
            <rect x="109" y="32" width="2" height="14" fill="#b45309" />
            {/* Barn Side Windows */}
            <rect x="34" y="76" width="38" height="30" fill="#7c4218" />
            <rect x="38" y="80" width="30" height="22" fill="#64748b" />
            <rect x="40" y="82" width="10" height="8" fill="#94a3b8" />
            <rect x="148" y="76" width="38" height="30" fill="#7c4218" />
            <rect x="152" y="80" width="30" height="22" fill="#64748b" />
            <rect x="154" y="82" width="10" height="8" fill="#94a3b8" />
            {/* Barn Double Door */}
            <rect x="82" y="82" width="56" height="64" fill="#6e3814" />
            <rect x="86" y="86" width="48" height="60" fill="#9e5626" />
            <rect x="109" y="86" width="2" height="60" fill="#6e3814" />
            <rect x="86" y="114" width="48" height="4" fill="#7c4218" />
            {/* Barn Sign */}
            <rect x="86" y="64" width="48" height="14" fill="#fef3c7" />
            <rect x="86" y="76" width="48" height="2" fill="#d97706" />
            <text x="110" y="74" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#78350f">
              BARN x{farm.barns.length}
            </text>
            {/* Feed Trough */}
            <rect x="18" y="132" width="42" height="14" fill="#b45309" />
            <rect x="20" y="132" width="38" height="6" fill="#fde047" />
          </g>
        </g>

        {/* ============================================================ */}
        {/* ICON 2: SILO เก็บอาหารเป็ด 16-bit */}
        {/* ============================================================ */}
        <g transform="translate(888, 128)">
          <g
            className="landmark-group"
            tabIndex={0}
            role="button"
            aria-label="เปิดข้อมูลไซโลอาหารและสูตรอาหารเป็ด"
            onMouseEnter={() => setHovered('SILO')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleSelectLandmark('SILO')}
            onKeyDown={(e) => e.key === 'Enter' && handleSelectLandmark('SILO')}
          >
            {/* Floating Capsule Badge Above Dome (Hidden on mobile & short phone landscape) */}
            <foreignObject x="-86" y="-28" width="300" height="32" overflow="visible">
              <div className="hidden md:flex [@media(max-height:500px)]:hidden items-center justify-center w-full h-full">
                <span
                  className={`px-2.5 py-1 rounded-full border-2 text-[11px] font-bold leading-none whitespace-nowrap flex items-center gap-1.5 ${getCapsuleClass(
                    siloBadge.severity
                  )}`}
                >
                  {siloBadge.severity !== 'normal' && (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{siloBadge.text}</span>
                </span>
              </div>
            </foreignObject>

            <ellipse cx="64" cy="184" rx="58" ry="11" fill="#3f7c25" opacity="0.55" />
            {/* Ribbed Metal Cylinder (Tone-on-tone steel pixel shading) */}
            <rect x="24" y="56" width="80" height="126" fill="#94a3b8" />
            <rect x="28" y="56" width="56" height="126" fill="#cbd5e1" />
            <rect x="34" y="56" width="20" height="126" fill="#e2e8f0" />
            <rect x="38" y="56" width="8" height="126" fill="#f8fafc" />
            {/* Horizontal Bands */}
            <rect x="24" y="88" width="80" height="6" fill="#64748b" />
            <rect x="24" y="124" width="80" height="6" fill="#64748b" />
            <rect x="24" y="158" width="80" height="6" fill="#64748b" />
            {/* 16-bit Cobalt Blue Dome Cap */}
            <path d="M22 58 Q64 8 106 58 Z" fill="#1d4ed8" />
            <path d="M26 56 Q64 14 96 56 Z" fill="#2563eb" />
            <path d="M34 52 Q58 22 76 52 Z" fill="#60a5fa" />
            <rect x="22" y="54" width="84" height="4" fill="#1e3a8a" />
            {/* Feed Level Window */}
            <rect x="52" y="98" width="24" height="54" fill="#475569" />
            <rect x="55" y="102" width="18" height="46" fill="#334155" />
            <rect x="55" y="114" width="18" height="34" fill="#facc15" />
            <rect x="55" y="114" width="6" height="34" fill="#fde047" />
            {/* Feed Chute & Grain Sacks */}
            <rect x="98" y="140" width="24" height="12" fill="#64748b" />
            <rect x="102" y="160" width="32" height="22" rx="8" fill="#c78d4a" />
            <rect x="106" y="162" width="20" height="12" fill="#e2ae6d" />
            <rect x="82" y="166" width="28" height="18" rx="7" fill="#d99f59" />
            <rect x="86" y="168" width="18" height="10" fill="#ecc082" />
            <text x="64" y="79" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#334155">
              SILO
            </text>
          </g>
        </g>

        {/* ============================================================ */}
        {/* ICON 3: บ้านผู้ดูแลฟาร์ม + เจ้าของฟาร์ม 16-bit */}
        {/* ============================================================ */}
        <g transform="translate(476, 134)">
          <g
            className="landmark-group"
            tabIndex={0}
            role="button"
            aria-label="เปิดการจัดการสภาพแวดล้อมโรงเรือน แสง แอมโมเนีย และ Auto-Brooder"
            onMouseEnter={() => setHovered('FARMHOUSE')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleSelectLandmark('FARMHOUSE')}
            onKeyDown={(e) => e.key === 'Enter' && handleSelectLandmark('FARMHOUSE')}
          >
            {/* Floating Capsule Badge Above Roof (Hidden on mobile & short phone landscape) */}
            <foreignObject x="-28" y="-30" width="300" height="32" overflow="visible">
              <div className="hidden md:flex [@media(max-height:500px)]:hidden items-center justify-center w-full h-full">
                <span
                  className={`px-2.5 py-1 rounded-full border-2 text-[11px] font-bold leading-none whitespace-nowrap flex items-center gap-1.5 ${getCapsuleClass(
                    farmhouseBadge.severity
                  )}`}
                >
                  {farmhouseBadge.severity !== 'normal' && (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{farmhouseBadge.text}</span>
                </span>
              </div>
            </foreignObject>

            <ellipse cx="122" cy="156" rx="112" ry="12" fill="#3f7c25" opacity="0.55" />
            {/* Brick Chimney + Animated Smoke */}
            <rect x="164" y="6" width="22" height="36" fill="#8b4222" />
            <rect x="164" y="6" width="22" height="6" fill="#682f15" />
            <rect x="166" y="14" width="8" height="6" fill="#a85632" />
            <g transform="translate(175, 2)">
              <circle cx="0" cy="0" r="7" fill="#ffffff" className="animate-smoke-1" />
            </g>
            <g transform="translate(178, 0)">
              <circle cx="0" cy="0" r="6" fill="#f1f5f9" className="animate-smoke-2" />
            </g>

            {/* Cozy Wooden Cabin Wall (Tone-on-tone warm redwood) */}
            <rect x="28" y="60" width="188" height="84" fill="#9c4124" />
            <rect x="28" y="60" width="188" height="8" fill="#782f18" />
            <rect x="34" y="68" width="176" height="60" fill="#b34d2c" />
            {/* Wooden Porch & Steps */}
            <rect x="24" y="128" width="196" height="24" fill="#c98948" />
            <rect x="24" y="146" width="196" height="6" fill="#945922" />
            <rect x="24" y="137" width="196" height="2" fill="#a6692d" />
            {/* 16-bit Emerald Shingled Roof */}
            <polygon points="12,64 122,10 232,64" fill="#184d30" />
            <polygon points="20,60 122,14 224,60" fill="#236b43" />
            <polygon points="32,56 122,18 212,56" fill="#2f8554" />
            {/* Roof shingle bands */}
            <rect x="60" y="38" width="124" height="4" fill="#236b43" />
            <rect x="86" y="26" width="72" height="4" fill="#236b43" />

            {/* Windows with Warm Sky Reflection */}
            <rect x="44" y="78" width="38" height="30" fill="#7c2d12" />
            <rect x="48" y="82" width="30" height="22" fill="#bae6fd" />
            <rect x="62" y="82" width="2" height="22" fill="#7c2d12" />
            <rect x="48" y="92" width="30" height="2" fill="#7c2d12" />

            <rect x="160" y="78" width="38" height="30" fill="#7c2d12" />
            <rect x="164" y="82" width="30" height="22" fill="#bae6fd" />
            <rect x="178" y="82" width="2" height="22" fill="#7c2d12" />
            <rect x="164" y="92" width="30" height="2" fill="#7c2d12" />

            {/* Front Door */}
            <rect x="104" y="82" width="34" height="48" fill="#92400e" />
            <rect x="108" y="86" width="26" height="42" fill="#d97706" />
            <rect x="128" y="104" width="4" height="4" fill="#fef08a" />
          </g>
        </g>

        {/* ============================================================ */}
        {/* ICON 4: ถุงเงินข้างลังใส่เป็ดผูกโบว์ที่คอ 16-bit */}
        {/* ============================================================ */}
        <g transform="translate(812, 434)">
          <g
            className="landmark-group"
            tabIndex={0}
            role="button"
            aria-label="เปิดบันทึกการขาย ต้นทุน กำไรสุทธิ และคุณภาพซาก"
            onMouseEnter={() => setHovered('SALES')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => handleSelectLandmark('SALES')}
            onKeyDown={(e) => e.key === 'Enter' && handleSelectLandmark('SALES')}
          >
            {/* Floating Capsule Badge Above Crate (Hidden on mobile & short phone landscape) */}
            <foreignObject x="-50" y="-36" width="300" height="32" overflow="visible">
              <div className="hidden md:flex [@media(max-height:500px)]:hidden items-center justify-center w-full h-full">
                <span
                  className={`px-2.5 py-1 rounded-full border-2 text-[11px] font-bold leading-none whitespace-nowrap flex items-center gap-1.5 ${getCapsuleClass(
                    salesBadge.severity
                  )}`}
                >
                  {salesBadge.severity !== 'normal' && (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{salesBadge.text}</span>
                </span>
              </div>
            </foreignObject>

            <ellipse cx="100" cy="116" rx="88" ry="12" fill="#3f7c25" opacity="0.55" />
            {/* Wooden Shipping Crate (16-bit plank shading, no harsh stroke) */}
            <rect x="16" y="42" width="100" height="72" fill="#9c5b25" />
            <rect x="22" y="48" width="88" height="60" fill="#cf8a48" />
            <rect x="22" y="66" width="88" height="4" fill="#a8682d" />
            <rect x="22" y="86" width="88" height="4" fill="#a8682d" />
            <rect x="12" y="38" width="108" height="12" fill="#b46e30" />
            <rect x="12" y="38" width="108" height="4" fill="#dfa05e" />

            {/* Cute 16-bit White Duck inside Crate with Coral Ribbon Bow */}
            <g transform="translate(38, -2)">
              {/* Head (tone-on-tone warm cream/grey) */}
              <rect x="16" y="8" width="26" height="24" fill="#ffffff" />
              <rect x="16" y="8" width="4" height="24" fill="#e2e8f0" />
              <rect x="20" y="8" width="22" height="4" fill="#f8fafc" />
              {/* Eye & Blush */}
              <rect x="32" y="16" width="4" height="4" fill="#334155" />
              <rect x="26" y="22" width="4" height="3" fill="#fda4af" />
              {/* Orange Beak */}
              <rect x="42" y="18" width="12" height="7" fill="#f97316" />
              <rect x="42" y="23" width="12" height="2" fill="#c2410c" />
              {/* Neck */}
              <rect x="18" y="32" width="22" height="10" fill="#ffffff" />
              {/* Cute 16-bit Ribbon Bow around the duck's neck */}
              <polygon points="10,33 26,39 10,45" fill="#e11d48" />
              <polygon points="48,33 32,39 48,45" fill="#e11d48" />
              <rect x="25" y="35" width="8" height="8" fill="#fb7185" />
              <rect x="25" y="41" width="8" height="2" fill="#be123c" />
            </g>

            {/* Plump 16-bit Golden Money Bag */}
            <g transform="translate(124, 34)">
              <path
                d="M16 18 L10 6 L38 6 L32 18 C46 28 50 64 42 78 L6 78 C-2 64 2 28 16 18 Z"
                fill="#ca8a04"
              />
              <path
                d="M18 20 L13 8 L35 8 L30 20 C42 29 45 61 38 74 L10 74 C3 61 6 29 18 20 Z"
                fill="#eab308"
              />
              <rect x="14" y="16" width="20" height="6" fill="#a16207" />
              <circle cx="24" cy="48" r="12" fill="#fef08a" />
              <text x="24" y="53" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#92400e">
                ฿
              </text>
            </g>
          </g>
        </g>

        {/* ============================================================ */}
        {/* CUTE ANIMATED 16-BIT GIMMICKS (Bounded strictly below fence y=148) */}
        {/* ============================================================ */}
        <g transform="translate(152, 470)">
          <g
            className="animate-duck-bob cursor-pointer"
            onClick={() => triggerDuckGimmick(1, 'ก๊าบ! น้ำเย็นสบายมาก')}
          >
            <foreignObject x="0" y="0" width="44" height="44">
              <PixelDuckSprite variant="white" size={40} />
            </foreignObject>
            <rect x="4" y="34" width="32" height="4" fill="#bae6fd" opacity="0.85" />
          </g>
        </g>

        <g transform="translate(345, 356)">
          <g
            className="animate-duck-waddle cursor-pointer"
            onClick={() => triggerDuckGimmick(2, 'หิวแล้ว! ขออาหารหน่อย')}
          >
            <foreignObject x="0" y="0" width="80" height="44">
              <div className="flex items-end gap-1">
                <PixelDuckSprite variant="white" size={38} />
                <PixelDuckSprite variant="duckling" size={26} />
              </div>
            </foreignObject>
          </g>
        </g>

        <g transform="translate(650, 445)">
          <g
            className="animate-duck-bob cursor-pointer"
            onClick={() => triggerDuckGimmick(3, 'เล้าสะอาด อากาศดี <3')}
          >
            <foreignObject x="0" y="0" width="44" height="44">
              <PixelDuckSprite variant="duckling" flip size={34} />
            </foreignObject>
          </g>
        </g>

        {duckBubble && (
          <g
            transform={`translate(${
              duckBubble.id === 1 ? 130 : duckBubble.id === 2 ? 315 : 610
            }, ${duckBubble.id === 1 ? 430 : duckBubble.id === 2 ? 314 : 405})`}
          >
            <rect
              x="0"
              y="0"
              width="160"
              height="30"
              rx="6"
              fill="#fffbeb"
              stroke="#b45309"
              strokeWidth="2"
            />
            <text x="80" y="19" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#78350f">
              {duckBubble.text}
            </text>
          </g>
        )}

        {/* Walking Farm Staff Worker (Strictly below top fence y=148 and outside duck pond x=82..345, y=418..578) */}
        <g className="animate-worker-patrol cursor-pointer" onClick={triggerWorkerGimmick}>
          <g className="animate-worker-face">
            <g className="animate-worker-step">
              <foreignObject x="0" y="0" width="46" height="46">
                <div className="flex items-center justify-center">
                  <PixelWorkerSprite size={44} />
                </div>
              </foreignObject>
            </g>
          </g>
          {workerBubble && (
            <g transform="translate(-72, -36)">
              <rect
                x="0"
                y="0"
                width="190"
                height="28"
                rx="6"
                fill="#fffbeb"
                stroke="#15803d"
                strokeWidth="2"
              />
              <text x="95" y="18" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#14532d">
                {workerBubble}
              </text>
            </g>
          )}
        </g>

        {/* Patrolling Black Cat with Red Collar (Strictly below top fence y=148 and outside duck pond x=82..345, y=414..574) */}
        <g
          className="animate-cat-patrol cursor-pointer"
          role="button"
          tabIndex={0}
          aria-label="คลิกแมวสีดำปลอกคอสีแดงเพื่อสุ่มคำพูด"
          onClick={triggerCatGimmick}
          onKeyDown={(e) => e.key === 'Enter' && triggerCatGimmick()}
        >
          <rect x="-4" y="-4" width="46" height="46" fill="transparent" />
          <g className="animate-cat-face">
            <g className="animate-cat-step">
              <foreignObject x="0" y="0" width="38" height="38">
                <div className="flex items-center justify-center">
                  <PixelBlackCatSprite size={38} />
                </div>
              </foreignObject>
            </g>
          </g>
          {catBubble && (
            <g transform="translate(-76, -34)">
              <rect
                x="0"
                y="0"
                width="190"
                height="28"
                rx="6"
                fill="#fff1f2"
                stroke="#dc2626"
                strokeWidth="2"
              />
              <text x="95" y="18" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#881337">
                {catBubble}
              </text>
            </g>
          )}
        </g>

        {/* Controllable 16-bit Farmer Girl (WASD + Spacebar on desktop) */}
        <g transform={`translate(${girlPos.x.toFixed(1)}, ${girlPos.y.toFixed(1)})`}>
          {/* Ground shadow that shrinks gently while jumping */}
          <ellipse
            cx="27"
            cy="49"
            rx={Math.max(8, 15 - girlJumpZ * 0.14)}
            ry={Math.max(3, 5 - girlJumpZ * 0.04)}
            fill="#2d5a1b"
            opacity={Math.max(0.2, 0.45 - girlJumpZ * 0.005)}
          />
          <g transform={`translate(0, ${(-girlJumpZ).toFixed(1)})`}>
            <g className={isGirlMoving && girlJumpZ === 0 ? 'animate-girl-step' : undefined}>
              <foreignObject x="0" y="0" width="54" height="54">
                <div
                  className="flex items-center justify-center"
                  style={{
                    transform: girlFacing === 'left' ? 'scaleX(-1)' : undefined,
                  }}
                >
                  <PixelFarmerSprite avatar={farm.farmerAvatar} size={52} />
                </div>
              </foreignObject>
            </g>
            {/* Floating Pixel Heart / Alert Bubble */}
            <g transform="translate(12, -24)">
              <g className="animate-heart-float">
                <rect x="0" y="0" width="28" height="22" rx="4" fill="#ffffff" />
                <rect x="0" y="20" width="28" height="2" fill="#cbd5e1" />
                <polygon points="10,22 14,27 18,22" fill="#ffffff" />
                <path
                  d="M14 16 L8 10 A3.5 3.5 0 0 1 14 7 A3.5 3.5 0 0 1 20 10 Z"
                  fill={hasHighAmmonia || hasColdHuddle ? '#f59e0b' : '#f43f5e'}
                />
              </g>
            </g>
          </g>
        </g>

        {/* Fluttering 16-bit Pixel Butterfly */}
        <g transform="translate(560, 390)">
          <g className="animate-butterfly">
            <rect x="0" y="0" width="5" height="6" fill="#f472b6" />
            <rect x="6" y="0" width="5" height="6" fill="#f472b6" />
            <rect x="5" y="2" width="1" height="5" fill="#78350f" />
          </g>
        </g>
      </svg>
      </div>

      {/* Hover Tooltip Banner (Desktop) */}
      {hovered && (
        <div className="pointer-events-none hidden lg:block fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pixel-wood-panel px-5 py-3 max-w-md w-auto">
          {hovered === 'BARN' && (
            <div>
              <div className="font-display font-bold text-base text-[#3a1f0f]">
                โรงเรือนเป็ด (Barns & Calendar)
              </div>
              <div className="text-xs text-[#5c2e14] mt-0.5 tabular-nums">
                เป็ดคงเหลือรวม {totalDucks.toLocaleString()} ตัว · {farm.barns.length} โรงเรือน · คลิกเพื่อดู ADG, FCR, FE และปฏิทินวัคซีน
              </div>
            </div>
          )}
          {hovered === 'SILO' && (
            <div>
              <div className="font-display font-bold text-base text-[#3a1f0f]">
                ไซโลเก็บอาหารเป็ด (Feed Silos & Formulas)
              </div>
              <div className="text-xs text-[#5c2e14] mt-0.5 tabular-nums">
                คงเหลือรวม {totalFeedKg.toLocaleString()} กก. · {farm.feedSilos.length} ไซโล · คำนวณหักอาหารอัตโนมัติ
              </div>
            </div>
          )}
          {hovered === 'FARMHOUSE' && (
            <div>
              <div className="font-display font-bold text-base text-[#3a1f0f]">
                บ้านผู้ดูแลฟาร์ม (Environment & Auto-Brooder)
              </div>
              <div className="text-xs text-[#5c2e14] mt-0.5 tabular-nums">
                อุณหภูมิ {broodingEnv?.temperatureC ?? 28}°C · แอมโมเนีย {broodingEnv?.ammoniaPpm ?? 5} ppm · ควบคุมแสงและกกอัตโนมัติ
              </div>
            </div>
          )}
          {hovered === 'SALES' && (
            <div>
              <div className="font-display font-bold text-base text-[#3a1f0f]">
                ลังส่งขาย & บัญชีการเงิน (Sales & Carcass Feedback)
              </div>
              <div className="text-xs text-[#5c2e14] mt-0.5 tabular-nums">
                {latestSale
                  ? `รอบล่าสุด ${latestSale.batchCode} · กำไรสุทธิ ฿${latestSale.netProfitThb.toLocaleString()}`
                  : 'คลิกเพื่อบันทึกรอบขาย ต้นทุนต่อตัว และคุณภาพซาก'}
              </div>
            </div>
          )}
        </div>
      )}

      {!hovered && (
        <div className="hidden lg:block fixed bottom-4 left-4 z-20 bg-[#f6e3ba]/95 border-2 border-[#723b18] px-3 py-1.5 shadow-md text-xs font-semibold text-[#4a2612]">
          <span>
            ชี้เมาส์ที่สิ่งปลูกสร้างเพื่อดูรายละเอียด · กด <kbd className="px-1 py-0.5 bg-[#fff9eb] border border-[#8e4c1d] font-mono-num text-[10px]">W A S D</kbd> เดิน · <kbd className="px-1 py-0.5 bg-[#fff9eb] border border-[#8e4c1d] font-mono-num text-[10px]">Space</kbd> กระโดด · คลิกเป็ดหรือแมวได้
          </span>
        </div>
      )}
    </div>
  );
};
