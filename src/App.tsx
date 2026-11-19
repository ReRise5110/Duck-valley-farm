import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  FileSpreadsheet,
  ArrowLeft,
  Volume2,
  VolumeX,
  Warehouse,
  Cylinder,
  Home,
  Coins,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ClipboardPenLine,
  LogOut,
} from 'lucide-react';
import { ActiveModalType, FarmData } from './types/farm';
import { FarmSelector } from './components/FarmSelector';
import { FarmScene } from './components/FarmScene';
import { BarnModal } from './components/BarnModal';
import { SiloModal } from './components/SiloModal';
import { FarmhouseModal } from './components/FarmhouseModal';
import { SalesModal } from './components/SalesModal';
import { TwoWaySyncModal } from './components/TwoWaySyncModal';
import { DailyLogModal } from './components/DailyLogModal';
import {
  initGoogleAuth,
  isFirebaseAuthConfigured,
  signInWithGoogleAccount,
  signOutGoogleWorkspace,
} from './services/googleAuth';
import {
  createUserFarm,
  deleteUserFarm,
  ensureUserProfile,
  subscribeUserFarms,
  updateUserFarm,
} from './services/farmRepository';
import { playPixelClick, playSuccessChime } from './utils/soundFx';

export default function App() {
  const [farms, setFarms] = useState<FarmData[]>([]);
  const [farmsLoading, setFarmsLoading] = useState<boolean>(false);
  const [farmsError, setFarmsError] = useState<string | null>(null);

  const [activeFarmId, setActiveFarmId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModalType>('NONE');
  const [muted, setMuted] = useState(false);

  // Google Auth & Workspace OAuth state
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authBanner, setAuthBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  type SyncStatus = 'LOADING' | 'SAVING' | 'SAVED' | 'ERROR';
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('SAVED');

  // Track pending debounced writes per farm ID so live snapshots don't clobber in-flight edits
  const pendingSavesRef = useRef<Map<string, { timer: number; farm: FarmData }>>(new Map());
  const activeUidRef = useRef<string | null>(null);

  const clearPendingSaves = () => {
    pendingSavesRef.current.forEach((entry) => {
      window.clearTimeout(entry.timer);
    });
    pendingSavesRef.current.clear();
  };

  // 1. Subscribe to Firebase Auth state (persists Google account across reloads)
  useEffect(() => {
    return initGoogleAuth((user, token) => {
      setCurrentUser(user);
      setAccessToken(token);
      setAuthReady(true);
    });
  }, []);

  // 2. Bind farm collection strictly to the currently authenticated Google user
  useEffect(() => {
    const uid = currentUser?.uid || null;
    if (activeUidRef.current !== uid) {
      clearPendingSaves();
      setActiveFarmId(null);
      setActiveModal('NONE');
      activeUidRef.current = uid;
    }

    if (!currentUser) {
      setFarms([]);
      setFarmsLoading(false);
      setFarmsError(null);
      setSyncStatus('SAVED');
      return;
    }

    let cancelled = false;
    let unsubscribeFarms: (() => void) | null = null;

    setFarmsLoading(true);
    setFarmsError(null);
    setSyncStatus('LOADING');

    ensureUserProfile(currentUser)
      .then(() => {
        if (cancelled) return;
        unsubscribeFarms = subscribeUserFarms(
          currentUser.uid,
          (loadedFarms) => {
            if (cancelled) return;
            const merged = loadedFarms.map((remoteFarm) => {
              const pending = pendingSavesRef.current.get(remoteFarm.id);
              return pending ? pending.farm : remoteFarm;
            });
            setFarms(merged);
            setFarmsLoading(false);
            setSyncStatus(pendingSavesRef.current.size > 0 ? 'SAVING' : 'SAVED');
          },
          (err) => {
            if (cancelled) return;
            setFarmsError(err.message || 'ไม่สามารถโหลดข้อมูลฟาร์มของบัญชีนี้ได้');
            setFarmsLoading(false);
            setSyncStatus('ERROR');
          }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setFarmsError(err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อบัญชีผู้ใช้ได้');
        setFarmsLoading(false);
        setSyncStatus('ERROR');
      });

    return () => {
      cancelled = true;
      unsubscribeFarms?.();
    };
  }, [currentUser]);

  // Clear pending timers on unmount
  useEffect(() => {
    return () => clearPendingSaves();
  }, []);

  const userEmail = currentUser?.email || currentUser?.displayName || null;
  const activeFarm = farms.find((f) => f.id === activeFarmId) || null;

  const handleUpdateActiveFarm = (updater: (prev: FarmData) => FarmData) => {
    if (!activeFarmId || !currentUser) return;
    const uid = currentUser.uid;
    const targetId = activeFarmId;

    setFarms((prevFarms) =>
      prevFarms.map((farm) => {
        if (farm.id !== targetId) return farm;
        const updated = updater(farm);

        const existingPending = pendingSavesRef.current.get(targetId);
        if (existingPending) {
          window.clearTimeout(existingPending.timer);
        }

        setSyncStatus('SAVING');
        const timer = window.setTimeout(() => {
          const latestEntry = pendingSavesRef.current.get(targetId);
          const farmToSave = latestEntry ? latestEntry.farm : updated;
          updateUserFarm(uid, farmToSave)
            .then(() => {
              pendingSavesRef.current.delete(targetId);
              if (pendingSavesRef.current.size === 0) {
                setSyncStatus('SAVED');
              }
            })
            .catch(() => {
              pendingSavesRef.current.delete(targetId);
              setSyncStatus('ERROR');
            });
        }, 450);

        pendingSavesRef.current.set(targetId, { timer, farm: updated });
        return updated;
      })
    );
  };

  const handleCreateFarm = async (newFarm: FarmData) => {
    if (!currentUser) {
      throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนสร้างฟาร์ม');
    }
    setFarmsError(null);
    setSyncStatus('SAVING');
    await createUserFarm(currentUser, newFarm);
    setFarms((prev) => (prev.some((f) => f.id === newFarm.id) ? prev : [...prev, newFarm]));
    setActiveFarmId(newFarm.id);
    setActiveModal('NONE');
    setSyncStatus('SAVED');
  };

  const handleCreateSampleSet = async (sampleFarms: FarmData[]) => {
    if (!currentUser) {
      throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนเริ่มเซ็ตฟาร์มตัวอย่าง');
    }
    if (sampleFarms.length === 0) return;
    setFarmsError(null);
    setSyncStatus('SAVING');
    try {
      for (const farm of sampleFarms) {
        await createUserFarm(currentUser, farm);
      }
      setFarms((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        return [...prev, ...sampleFarms.filter((f) => !existingIds.has(f.id))];
      });
      setActiveFarmId(sampleFarms[0].id);
      setActiveModal('NONE');
      setSyncStatus('SAVED');
    } catch (err) {
      setSyncStatus('ERROR');
      throw err;
    }
  };

  const handleDeleteFarm = async (farmId: string) => {
    if (!currentUser) {
      throw new Error('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนลบฟาร์ม');
    }
    const pending = pendingSavesRef.current.get(farmId);
    if (pending) {
      window.clearTimeout(pending.timer);
      pendingSavesRef.current.delete(farmId);
    }

    setSyncStatus('SAVING');
    await deleteUserFarm(currentUser.uid, farmId);
    setFarms((prev) => prev.filter((f) => f.id !== farmId));
    if (activeFarmId === farmId) {
      setActiveFarmId(null);
      setActiveModal('NONE');
    }
    setSyncStatus('SAVED');
  };

  const handleHeaderGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthBanner(null);
    try {
      const res = await signInWithGoogleAccount();
      setCurrentUser(res.user);
      setAccessToken(res.accessToken);
      playSuccessChime(muted);
      setAuthBanner({
        type: 'ok',
        text: `เข้าสู่ระบบด้วย ${res.user.email || res.user.displayName} สำเร็จ`,
      });
      window.setTimeout(() => setAuthBanner(null), 4000);
    } catch (err) {
      setAuthBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบ Google ได้',
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleHeaderGoogleSignOut = async () => {
    playPixelClick(muted);
    clearPendingSaves();
    await signOutGoogleWorkspace();
    setCurrentUser(null);
    setAccessToken(null);
    setFarms([]);
    setActiveFarmId(null);
    setActiveModal('NONE');
    setAuthBanner({ type: 'ok', text: 'ออกจากระบบ Google แล้ว' });
    window.setTimeout(() => setAuthBanner(null), 3000);
  };

  if (!activeFarm || !currentUser) {
    return (
      <FarmSelector
        farms={farms}
        farmsLoading={farmsLoading}
        farmsError={farmsError}
        authReady={authReady}
        currentUser={currentUser}
        onSelectFarm={(id) => {
          setActiveFarmId(id);
          setActiveModal('NONE');
        }}
        onCreateFarm={handleCreateFarm}
        onCreateSampleSet={handleCreateSampleSet}
        onDeleteFarm={handleDeleteFarm}
        muted={muted}
        onAuthChange={(user, token) => {
          setCurrentUser(user);
          setAccessToken(token);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#2b180e]">
      {/* Cozy Stardew-style Top HUD Bar (3 clean zones) */}
      <header className="pixel-wood-header px-2.5 sm:px-4 py-2 sm:py-2.5 [@media(max-height:500px)]:py-1.5 flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-30">
        {/* Zone 1: Farm Wordmark & Switch Farm */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveFarmId(null);
              setActiveModal('NONE');
            }}
            className="pixel-btn bg-[#d9a462] hover:bg-[#c8914e] text-[#2b180e] text-xs font-bold px-2 sm:px-2.5 py-1.5 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">เปลี่ยนฟาร์ม</span>
          </button>
          <span className="font-display text-sm sm:text-lg font-bold text-[#fff5dc] truncate">
            {activeFarm.name}
          </span>
        </div>

        {/* Zone 2: Quick Landmark Navigation Links (Desktop lg+) */}
        <nav className="hidden lg:flex items-center gap-2.5 xl:gap-4 text-[11px] xl:text-xs font-bold text-amber-100">
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveModal('BARN');
            }}
            className="hover:text-white hover:underline flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Warehouse className="w-4 h-4 text-amber-300" />
            โรงเรือน
          </button>
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveModal('SILO');
            }}
            className="hover:text-white hover:underline flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Cylinder className="w-4 h-4 text-sky-300" />
            ไซโลอาหาร
          </button>
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveModal('FARMHOUSE');
            }}
            className="hover:text-white hover:underline flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Home className="w-4 h-4 text-emerald-300" />
            <span>
              คุมโรงเรือน<span className="hidden xl:inline"> &amp; Brooder</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveModal('SALES');
            }}
            className="hover:text-white hover:underline flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Coins className="w-4 h-4 text-yellow-300" />
            ขาย &amp; กำไร
          </button>
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveModal('DAILY_LOG');
            }}
            className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] text-[11px] xl:text-xs font-bold px-2.5 py-1 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardPenLine className="w-3.5 h-3.5" />
            บันทึกประจำวัน
          </button>
        </nav>

        {/* Zone 3: Sync Status Badge + Sound Toggle + Account + Primary Sync CTA */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="status"
            aria-live="polite"
            title={
              syncStatus === 'SAVED'
                ? 'บันทึกข้อมูลฟาร์มในบัญชี Google แล้ว'
                : syncStatus === 'SAVING'
                  ? 'กำลังบันทึกข้อมูลฟาร์ม...'
                  : syncStatus === 'LOADING'
                    ? 'กำลังโหลดข้อมูลฟาร์ม...'
                    : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'
            }
            className={`px-2.5 py-1 border text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 select-none ${
              syncStatus === 'SAVED'
                ? 'bg-[#214a25]/85 text-[#bbf7d0] border-[#4ade80]/50'
                : syncStatus === 'SAVING'
                  ? 'bg-[#6b3c10]/90 text-[#fde68a] border-[#fbbf24]/70'
                  : syncStatus === 'LOADING'
                    ? 'bg-[#163d5c]/85 text-[#bae6fd] border-[#38bdf8]/60'
                    : 'bg-[#691c1c]/90 text-[#fecaca] border-[#f87171]/70'
            }`}
          >
            {syncStatus === 'SAVED' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            {(syncStatus === 'SAVING' || syncStatus === 'LOADING') && (
              <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
            )}
            {syncStatus === 'ERROR' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span className="hidden sm:inline">
              {syncStatus === 'SAVED' && 'บันทึกในบัญชีแล้ว'}
              {syncStatus === 'SAVING' && 'กำลังบันทึก...'}
              {syncStatus === 'LOADING' && 'กำลังโหลด...'}
              {syncStatus === 'ERROR' && 'บันทึกผิดพลาด'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="p-2 bg-[#4a2612]/60 hover:bg-[#4a2612] text-amber-200 border border-amber-700/60 cursor-pointer"
            title={muted ? 'เปิดเสียงเอฟเฟกต์' : 'ปิดเสียงเอฟเฟกต์'}
            aria-label={muted ? 'เปิดเสียงเอฟเฟกต์' : 'ปิดเสียงเอฟเฟกต์'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {isFirebaseAuthConfigured() &&
            (currentUser && userEmail ? (
              <button
                type="button"
                onClick={handleHeaderGoogleSignOut}
                title={`เข้าสู่ระบบแล้ว: ${userEmail} (คลิกเพื่อสลับบัญชี/ออกจากระบบ)`}
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-2 border-[#2b180e] text-[11px] font-bold px-2 py-1 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="max-w-[130px] hidden xl:inline truncate">{userEmail}</span>
                <span className="xl:hidden">Google ✓</span>
                <LogOut className="w-3.5 h-3.5 text-rose-700" />
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={handleHeaderGoogleSignIn}
                title="เข้าสู่ระบบด้วยบัญชี Google"
                className="bg-white hover:bg-slate-50 disabled:opacity-60 text-[#1f1f1f] border-2 border-[#2b180e] text-[11px] font-bold px-2 sm:px-2.5 py-1 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="hidden sm:inline">
                  {authBusy ? 'กำลังเข้า...' : 'เข้าสู่ระบบ Google'}
                </span>
              </button>
            ))}

          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveModal('SYNC');
            }}
            className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white text-xs font-bold px-2.5 sm:px-3.5 py-1.5 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden xl:inline">Two-Way Sheet Sync</span>
            <span className="hidden sm:inline xl:hidden">Sheet Sync</span>
            <span className="sm:hidden">Sync</span>
          </button>
        </div>
      </header>

      {authBanner && (
        <div
          className={`px-4 py-2 text-xs font-bold border-b-2 flex items-center justify-between gap-2 z-30 ${
            authBanner.type === 'ok'
              ? 'bg-emerald-100 border-emerald-700 text-emerald-950'
              : 'bg-rose-100 border-rose-700 text-rose-950'
          }`}
        >
          <span>{authBanner.text}</span>
          <button
            type="button"
            onClick={() => setAuthBanner(null)}
            className="underline cursor-pointer shrink-0"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Main Interactive Pixel Farm World */}
      <main className="flex-1 relative overflow-hidden">
        <FarmScene
          farm={activeFarm}
          onOpenModal={(modal) => setActiveModal(modal)}
          muted={muted}
          modalOpen={activeModal !== 'NONE'}
        />

        {/* Mobile & Tablet Quick Access Dock */}
        <div className="lg:hidden fixed bottom-3 inset-x-3 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[560px] md:bottom-4 [@media(max-height:500px)]:bottom-1.5 [@media(max-height:500px)]:inset-x-auto [@media(max-height:500px)]:left-1/2 [@media(max-height:500px)]:-translate-x-1/2 [@media(max-height:500px)]:w-[520px] [@media(max-height:500px)]:max-w-[96vw] z-20 pixel-wood-panel p-1.5 md:p-2 [@media(max-height:500px)]:p-1 grid grid-cols-5 gap-1 md:gap-2 text-[10px] md:text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              playPixelClick(muted);
              setActiveModal('DAILY_LOG');
            }}
            className="bg-[#fde047] border border-[#723b18] py-2 [@media(max-height:500px)]:py-1 flex flex-col [@media(max-height:500px)]:flex-row items-center justify-center gap-1 cursor-pointer text-[#2b180e]"
          >
            <ClipboardPenLine className="w-4 h-4 [@media(max-height:500px)]:w-3.5 [@media(max-height:500px)]:h-3.5 text-[#7c2d12]" />
            <span>บันทึกวัน</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('BARN')}
            className="bg-[#fff9eb] border border-[#723b18] py-2 [@media(max-height:500px)]:py-1 flex flex-col [@media(max-height:500px)]:flex-row items-center justify-center gap-1 cursor-pointer"
          >
            <Warehouse className="w-4 h-4 [@media(max-height:500px)]:w-3.5 [@media(max-height:500px)]:h-3.5 text-amber-700" />
            <span>โรงเรือน</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('SILO')}
            className="bg-[#fff9eb] border border-[#723b18] py-2 [@media(max-height:500px)]:py-1 flex flex-col [@media(max-height:500px)]:flex-row items-center justify-center gap-1 cursor-pointer"
          >
            <Cylinder className="w-4 h-4 [@media(max-height:500px)]:w-3.5 [@media(max-height:500px)]:h-3.5 text-sky-700" />
            <span>ไซโล</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('FARMHOUSE')}
            className="bg-[#fff9eb] border border-[#723b18] py-2 [@media(max-height:500px)]:py-1 flex flex-col [@media(max-height:500px)]:flex-row items-center justify-center gap-1 cursor-pointer"
          >
            <Home className="w-4 h-4 [@media(max-height:500px)]:w-3.5 [@media(max-height:500px)]:h-3.5 text-emerald-700" />
            <span>คุมโรงเรือน</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveModal('SALES')}
            className="bg-[#fff9eb] border border-[#723b18] py-2 [@media(max-height:500px)]:py-1 flex flex-col [@media(max-height:500px)]:flex-row items-center justify-center gap-1 cursor-pointer"
          >
            <Coins className="w-4 h-4 [@media(max-height:500px)]:w-3.5 [@media(max-height:500px)]:h-3.5 text-yellow-700" />
            <span>การขาย</span>
          </button>
        </div>
      </main>

      {/* Active Feature Modals */}
      {activeModal === 'DAILY_LOG' && (
        <DailyLogModal
          farm={activeFarm}
          onUpdateFarm={handleUpdateActiveFarm}
          onClose={() => setActiveModal('NONE')}
          muted={muted}
        />
      )}
      {activeModal === 'BARN' && (
        <BarnModal
          farm={activeFarm}
          onUpdateFarm={handleUpdateActiveFarm}
          onClose={() => setActiveModal('NONE')}
          accessToken={accessToken}
          muted={muted}
        />
      )}
      {activeModal === 'SILO' && (
        <SiloModal
          farm={activeFarm}
          onUpdateFarm={handleUpdateActiveFarm}
          onClose={() => setActiveModal('NONE')}
          muted={muted}
        />
      )}
      {activeModal === 'FARMHOUSE' && (
        <FarmhouseModal
          farm={activeFarm}
          onUpdateFarm={handleUpdateActiveFarm}
          onClose={() => setActiveModal('NONE')}
          muted={muted}
        />
      )}
      {activeModal === 'SALES' && (
        <SalesModal
          farm={activeFarm}
          onUpdateFarm={handleUpdateActiveFarm}
          onClose={() => setActiveModal('NONE')}
          muted={muted}
        />
      )}
      {activeModal === 'SYNC' && (
        <TwoWaySyncModal
          farm={activeFarm}
          onUpdateFarm={handleUpdateActiveFarm}
          onClose={() => setActiveModal('NONE')}
          accessToken={accessToken}
          userEmail={userEmail}
          onAuthChange={(token) => {
            setAccessToken(token);
          }}
          muted={muted}
        />
      )}
    </div>
  );
}
