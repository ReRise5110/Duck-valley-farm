import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Plus,
  Trash2,
  ArrowRight,
  MapPin,
  Sprout,
  FileSpreadsheet,
  LogOut,
  AlertCircle,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { FarmData } from '../types/farm';
import { createNewFarmTemplate, createSampleFarmSet } from '../data/seedFarms';
import { PixelDuckSprite, PixelFarmerSprite } from './PixelSprites';
import {
  isFirebaseAuthConfigured,
  signInWithGoogleAccount,
  signOutGoogleWorkspace,
} from '../services/googleAuth';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

interface FarmSelectorProps {
  farms: FarmData[];
  farmsLoading: boolean;
  farmsError: string | null;
  authReady: boolean;
  currentUser: User | null;
  onSelectFarm: (farmId: string) => void;
  onCreateFarm: (newFarm: FarmData) => Promise<void>;
  onCreateSampleSet: (sampleFarms: FarmData[]) => Promise<void>;
  onDeleteFarm: (farmId: string) => Promise<void>;
  muted: boolean;
  onAuthChange: (user: User | null, token: string | null) => void;
}

const AVATAR_OPTIONS: Array<{ id: FarmData['farmerAvatar']; label: string }> = [
  { id: 'ribbon', label: 'โบว์แดงสดใส' },
  { id: 'sunhat', label: 'หมวกฟางเหลือง' },
  { id: 'straw', label: 'หมวกชาวไร่' },
  { id: 'bandana', label: 'หมวกฟ้าลุยฟาร์ม' },
];

const BREED_OPTIONS = [
  'Cherry Valley SM3',
  'Pekin Super Meat',
  'Grimaud Star 53',
  'Muscovy (เป็ดเทศเนื้อ)',
];

const GoogleLogoSvg = () => (
  <svg viewBox="0 0 48 48" style={{ display: 'block' }}>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

export const FarmSelector: React.FC<FarmSelectorProps> = ({
  farms,
  farmsLoading,
  farmsError,
  authReady,
  currentUser,
  onSelectFarm,
  onCreateFarm,
  onCreateSampleSet,
  onDeleteFarm,
  muted,
  onAuthChange,
}) => {
  const [showNewForm, setShowNewForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showLoginPopup, setShowLoginPopup] = useState(true);

  const [farmName, setFarmName] = useState('');
  const [location, setLocation] = useState('');
  const [farmerName, setFarmerName] = useState('');
  const [farmerAvatar, setFarmerAvatar] = useState<FarmData['farmerAvatar']>('ribbon');
  const [breed, setBreed] = useState(BREED_OPTIONS[0]);
  const [barnCount, setBarnCount] = useState(2);
  const [googleSheetId, setGoogleSheetId] = useState('');

  const userEmail = currentUser?.email || currentUser?.displayName || null;

  const handleGoogleLogin = async () => {
    setAuthBusy(true);
    setAuthError(null);
    setActionError(null);
    try {
      const res = await signInWithGoogleAccount();
      onAuthChange(res.user, res.accessToken);
      setShowNewForm(false);
      setConfirmDeleteId(null);
      playSuccessChime(muted);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบ Google ได้');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleLogout = async () => {
    playPixelClick(muted);
    await signOutGoogleWorkspace();
    onAuthChange(null, null);
    setShowNewForm(false);
    setConfirmDeleteId(null);
    setAuthError(null);
    setActionError(null);
    setShowLoginPopup(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmName.trim() || creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = createNewFarmTemplate({
        name: farmName,
        location,
        farmerName: farmerName.trim() || currentUser?.displayName || 'เกษตรกรคนเก่ง',
        farmerAvatar,
        breed: breed.trim() || BREED_OPTIONS[0],
        barnCount,
        googleSheetId,
      });
      await onCreateFarm(created);
      playSuccessChime(muted);
      setShowNewForm(false);
      setFarmName('');
      setLocation('');
      setFarmerName('');
      setGoogleSheetId('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'ไม่สามารถสร้างฟาร์มได้ กรุณาลองใหม่');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmDelete = async (farmId: string) => {
    setDeletingId(farmId);
    setActionError(null);
    try {
      playPixelClick(muted);
      await onDeleteFarm(farmId);
      setConfirmDeleteId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'ไม่สามารถลบฟาร์มได้');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadSampleSet = async () => {
    if (seedingSample || creating) return;
    playPixelClick(muted);
    setSeedingSample(true);
    setActionError(null);
    try {
      const sampleSet = createSampleFarmSet();
      await onCreateSampleSet(sampleSet);
      playSuccessChime(muted);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'ไม่สามารถสร้างเซ็ตฟาร์มตัวอย่างได้ กรุณาลองใหม่'
      );
    } finally {
      setSeedingSample(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden bg-gradient-to-b from-[#6ec6f5] via-[#a8e1fa] to-[#7ec850] flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Pixel sky clouds & grass hills backdrop */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-10 left-8 opacity-85 animate-cloud-slow">
          <div className="w-28 h-8 bg-white border-b-4 border-sky-200 shadow-sm" />
          <div className="w-16 h-5 bg-white -mt-11 ml-6" />
        </div>
        <div className="absolute top-24 left-1/3 opacity-75 animate-cloud-fast">
          <div className="w-24 h-7 bg-white border-b-4 border-sky-200" />
          <div className="w-12 h-4 bg-white -mt-9 ml-5" />
        </div>
        <div className="absolute bottom-0 inset-x-0 h-40 bg-[#5da832] border-t-8 border-[#488724]" />
        <div className="absolute bottom-24 right-16 animate-duck-waddle">
          <PixelDuckSprite variant="white" size={44} />
        </div>
        <div className="absolute bottom-24 right-32 animate-duck-bob">
          <PixelDuckSprite variant="duckling" size={30} />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        {/* Wooden Sign Title Board */}
        <div className="pixel-wood-panel px-5 sm:px-6 py-4 sm:py-5 mb-6 text-center space-y-3">
          <div>
            <div className="flex items-center justify-center gap-3 mb-1">
              <PixelDuckSprite variant="duckling" size={34} />
              <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#4a2612]">
                Duck Valley Farm
              </h1>
              <PixelDuckSprite variant="white" flip size={36} />
            </div>
            <p className="text-sm sm:text-base font-medium text-[#723b18]">
              ระบบจัดการฟาร์มเป็ดเนื้อ · ข้อมูลฟาร์มผูกกับบัญชี Google ของคุณโดยเฉพาะ
            </p>
          </div>

          {isFirebaseAuthConfigured() && authReady && currentUser && userEmail && (
            <div className="pt-2 border-t border-[#d6b680] flex flex-col items-center gap-2">
              <div className="inline-flex flex-wrap items-center justify-center gap-2.5 bg-emerald-100 border-2 border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-950">
                <span>เข้าสู่ระบบ Google แล้ว: {userEmail}</span>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleGoogleLogin}
                  className="inline-flex items-center gap-1 text-sky-900 hover:underline cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${authBusy ? 'animate-spin' : ''}`} />
                  สลับบัญชี (Popup)
                </button>
                <span aria-hidden="true" className="text-emerald-700">
                  |
                </span>
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="inline-flex items-center gap-1 text-rose-800 hover:underline cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  ออกจากระบบ
                </button>
              </div>
              {authError && (
                <div className="bg-rose-100 border-2 border-rose-700 text-rose-950 px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main Wooden Board Content */}
        <div className="pixel-wood-panel overflow-hidden">
          <div className="pixel-wood-header px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#fff5dc]">
              <Sprout className="w-5 h-5 text-amber-300" />
              <h2 className="font-display text-lg font-bold">
                {!authReady
                  ? 'กำลังเชื่อมต่อระบบ...'
                  : !currentUser
                    ? 'เข้าสู่ระบบด้วยบัญชี Google'
                    : showNewForm
                      ? 'สร้างฟาร์มเป็ดใหม่ (New Farm)'
                      : `ฟาร์มของบัญชี (${farms.length})`}
              </h2>
            </div>

            {currentUser && !farmsLoading && (
              !showNewForm ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={seedingSample}
                    onClick={handleLoadSampleSet}
                    className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] font-bold text-sm px-3.5 py-2 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    <Sparkles className="w-4 h-4" />
                    {seedingSample ? 'กำลังสร้างตัวอย่าง...' : 'เซ็ตฟาร์มตัวอย่าง'}
                  </button>
                  <button
                    type="button"
                    disabled={seedingSample}
                    onClick={() => {
                      playPixelClick(muted);
                      setShowNewForm(true);
                      setActionError(null);
                    }}
                    className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white font-semibold text-sm px-4 py-2 flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    <Plus className="w-4 h-4" />
                    สร้างฟาร์ม
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    playPixelClick(muted);
                    setShowNewForm(false);
                    setActionError(null);
                  }}
                  className="pixel-btn bg-[#d9a462] hover:bg-[#c8914e] text-[#3a1f0f] font-semibold text-sm px-4 py-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  กลับไปหน้าเลือกฟาร์ม
                </button>
              )
            )}
          </div>

          <div className="p-5 sm:p-6">
            {!authReady ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-[#5c2e14]">
                <RefreshCw className="w-7 h-7 animate-spin text-[#8e4c1d]" />
                <p className="text-sm font-bold">กำลังตรวจสอบบัญชี Google...</p>
              </div>
            ) : !currentUser ? (
              <div className="py-8 px-4 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-20 h-20 bg-[#fff9eb] border-2 border-[#723b18] flex items-center justify-center">
                  <PixelDuckSprite variant="duckling" size={56} />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h3 className="font-display text-xl font-bold text-[#3a1f0f]">
                    เชื่อมต่อบัญชี Google เพื่อเริ่มจัดการฟาร์ม
                  </h3>
                  <p className="text-sm text-[#5c2e14]">
                    เข้าสู่ระบบด้วย Google แบบ Popup เพื่อแสดงและบันทึกข้อมูลฟาร์มเฉพาะบัญชีของคุณ
                  </p>
                </div>

                {isFirebaseAuthConfigured() ? (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      disabled={authBusy}
                      onClick={handleGoogleLogin}
                      className="gsi-material-button disabled:opacity-60"
                    >
                      <div className="gsi-material-button-icon">
                        <GoogleLogoSvg />
                      </div>
                      <span>{authBusy ? 'กำลังเปิด Popup...' : 'Sign in with Google'}</span>
                    </button>
                    {!showLoginPopup && (
                      <button
                        type="button"
                        onClick={() => {
                          playPixelClick(muted);
                          setShowLoginPopup(true);
                        }}
                        className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] text-xs font-bold px-3.5 py-2 cursor-pointer"
                      >
                        เปิดหน้าต่าง Popup ล็อกอิน
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="bg-rose-100 border-2 border-rose-700 text-rose-950 px-4 py-2 text-xs font-bold">
                    ยังไม่ได้ตั้งค่า Firebase Auth ในโปรเจกต์นี้
                  </div>
                )}

                {authError && (
                  <div className="bg-rose-100 border-2 border-rose-700 text-rose-950 px-3.5 py-2 text-xs font-semibold flex items-center gap-2 max-w-lg text-left">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{authError}</span>
                  </div>
                )}
              </div>
            ) : farmsLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-[#5c2e14]">
                <RefreshCw className="w-7 h-7 animate-spin text-[#8e4c1d]" />
                <p className="text-sm font-bold">กำลังโหลดข้อมูลฟาร์มของ {userEmail}...</p>
              </div>
            ) : (
              <>
                {(farmsError || actionError) && (
                  <div className="mb-4 bg-rose-100 border-2 border-rose-700 text-rose-950 px-3.5 py-2 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{actionError || farmsError}</span>
                  </div>
                )}

                {!showNewForm ? (
                  farms.length === 0 ? (
                    <div className="py-10 px-4 flex flex-col items-center justify-center text-center space-y-4 bg-[#fff9eb]/70 border-2 border-dashed border-[#8e4c1d]">
                      <div className="w-20 h-20 bg-[#e5cfa2] border-2 border-[#723b18] flex items-center justify-center">
                        <PixelDuckSprite variant="duckling" size={54} />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-display text-2xl font-bold text-[#3a1f0f]">
                          ยังไม่สร้างฟาร์ม
                        </h3>
                        <p className="text-sm text-[#5c2e14] max-w-md">
                          บัญชี <span className="font-bold">{userEmail}</span> ยังไม่มีข้อมูลฟาร์มในระบบ
                          สามารถสร้างฟาร์มใหม่เอง หรือกดเข้าชมเซ็ตฟาร์มตัวอย่างที่ตั้งค่ามาตรฐานไว้ครบถ้วนแล้ว
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          disabled={seedingSample}
                          onClick={() => {
                            playPixelClick(muted);
                            setShowNewForm(true);
                            setActionError(null);
                          }}
                          className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white font-bold text-base px-6 py-2.5 flex items-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          <Plus className="w-5 h-5" />
                          สร้างฟาร์ม
                        </button>
                        <button
                          type="button"
                          disabled={seedingSample}
                          onClick={handleLoadSampleSet}
                          className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] font-bold text-base px-6 py-2.5 flex items-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          <Sparkles className="w-5 h-5" />
                          {seedingSample ? 'กำลังโหลดฟาร์มตัวอย่าง...' : 'เซ็ตฟาร์มตัวอย่าง'}
                        </button>
                      </div>
                      <p className="text-xs text-[#723b18] max-w-lg">
                        เซ็ตฟาร์มตัวอย่างจะจำลองฟาร์มเป็ดมาตรฐาน 2 แห่ง พร้อมโรงเรือน ประวัติน้ำหนัก &amp; ADG ไซโลอาหาร สภาพแวดล้อม ปฏิทิน และสรุปผลงานประจำรุ่นที่เหมาะสมให้ทดลองใช้งานทันที
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {farms.map((farm) => {
                        const totalDucks = farm.barns.reduce((sum, b) => sum + b.currentDucks, 0);
                        const activeBarns = farm.barns.filter((b) => b.status === 'ACTIVE').length;
                        const isDeleting = confirmDeleteId === farm.id;
                        const isBusyDelete = deletingId === farm.id;

                        return (
                          <div
                            key={farm.id}
                            className="pixel-card p-4 flex flex-col justify-between gap-4 transition-transform duration-150 hover:-translate-y-0.5"
                          >
                            <div className="flex items-start gap-3.5">
                              <div className="w-16 h-16 bg-[#e5cfa2] border-2 border-[#723b18] flex items-center justify-center shrink-0">
                                <PixelFarmerSprite avatar={farm.farmerAvatar} size={52} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h3 className="font-display text-lg font-bold text-[#3a1f0f] truncate">
                                  {farm.name}
                                </h3>
                                <div className="flex items-center gap-1.5 text-xs text-[#723b18] mt-0.5">
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{farm.location}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#5c2e14] tabular-nums">
                                  <span>ผู้ดูแล: {farm.farmerName}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{farm.barns.length} โรงเรือน ({activeBarns} เลี้ยงอยู่)</span>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 border-y-2 border-[#e5cfa2] py-2.5 text-center">
                              <div>
                                <div className="text-[11px] text-[#723b18]">เป็ดทั้งหมด</div>
                                <div className="font-mono-num text-base font-bold text-[#3a1f0f]">
                                  {totalDucks.toLocaleString()}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-[#723b18]">อาหารคงเหลือ</div>
                                <div className="font-mono-num text-base font-bold text-[#3a1f0f]">
                                  {farm.feedSilos
                                    .reduce((s, f) => s + f.remainingKg, 0)
                                    .toLocaleString()}{' '}
                                  กก.
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-[#723b18]">ซิงค์ล่าสุด</div>
                                <div className="font-mono-num text-[11px] font-semibold text-[#5c2e14] mt-1 truncate">
                                  {farm.lastSyncedAt}
                                </div>
                              </div>
                            </div>

                            {isDeleting ? (
                              <div className="flex items-center justify-between gap-2 bg-rose-100 border-2 border-rose-700 p-2.5">
                                <span className="text-xs font-semibold text-rose-900">
                                  ยืนยันลบฟาร์มนี้?
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isBusyDelete}
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2.5 py-1 text-xs font-semibold bg-white border-2 border-[#4a2612] cursor-pointer disabled:opacity-50"
                                  >
                                    ยกเลิก
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusyDelete}
                                    onClick={() => handleConfirmDelete(farm.id)}
                                    className="px-2.5 py-1 text-xs font-semibold bg-rose-600 text-white border-2 border-[#4a2612] cursor-pointer disabled:opacity-50"
                                  >
                                    {isBusyDelete ? 'กำลังลบ...' : 'ลบถาวร'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    playPixelClick(muted);
                                    setConfirmDeleteId(farm.id);
                                  }}
                                  className="px-2.5 py-1.5 text-xs font-bold text-rose-800 hover:text-rose-950 bg-rose-50 hover:bg-rose-100 border-2 border-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                                  title="ลบฟาร์ม"
                                  aria-label={`ลบ ${farm.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  ลบฟาร์ม
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    playSuccessChime(muted);
                                    onSelectFarm(farm.id);
                                  }}
                                  className="pixel-btn bg-[#e69128] hover:bg-[#d47e18] text-[#2b180e] font-bold text-sm px-5 py-2 flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  เข้าสู่ฟาร์ม
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <form onSubmit={handleCreateSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-[#4a2612] mb-1">
                          ชื่อฟาร์ม *
                        </label>
                        <input
                          type="text"
                          required
                          value={farmName}
                          onChange={(e) => setFarmName(e.target.value)}
                          placeholder="เช่น ฟาร์มเป็ดแสนสุข"
                          className="w-full bg-[#fff9eb] border-2 border-[#723b18] px-3 py-2 text-sm text-[#3a1f0f] focus:outline-none focus:border-amber-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#4a2612] mb-1">
                          จังหวัด / ทำเลฟาร์ม
                        </label>
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="เช่น นครปฐม · บางเลน"
                          className="w-full bg-[#fff9eb] border-2 border-[#723b18] px-3 py-2 text-sm text-[#3a1f0f] focus:outline-none focus:border-amber-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#4a2612] mb-1">
                          ชื่อผู้ดูแลฟาร์ม
                        </label>
                        <input
                          type="text"
                          value={farmerName}
                          onChange={(e) => setFarmerName(e.target.value)}
                          placeholder="เช่น พี่ต้น"
                          className="w-full bg-[#fff9eb] border-2 border-[#723b18] px-3 py-2 text-sm text-[#3a1f0f] focus:outline-none focus:border-amber-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#4a2612] mb-1">
                          สายพันธุ์เป็ดเนื้อหลัก (พิมพ์เองหรือเลือกจากรายการ)
                        </label>
                        <input
                          type="text"
                          required
                          list="duck-breed-options"
                          value={breed}
                          onChange={(e) => setBreed(e.target.value)}
                          placeholder="พิมพ์สายพันธุ์ เช่น Cherry Valley SM3, เป็ดกบินทร์..."
                          className="w-full bg-[#fff9eb] border-2 border-[#723b18] px-3 py-2 text-sm text-[#3a1f0f] focus:outline-none focus:border-amber-600"
                        />
                        <datalist id="duck-breed-options">
                          {BREED_OPTIONS.map((b) => (
                            <option key={b} value={b} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#4a2612] mb-1">
                          จำนวนโรงเรือนเริ่มต้น
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={barnCount}
                          onChange={(e) =>
                            setBarnCount(Math.max(1, Math.min(10, Number(e.target.value))))
                          }
                          className="w-full bg-[#fff9eb] border-2 border-[#723b18] px-3 py-2 text-sm text-[#3a1f0f] font-mono-num focus:outline-none focus:border-amber-600"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-[#4a2612] mb-1 flex items-center gap-1.5">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                          Google Sheet ID / URL (ไม่บังคับ)
                        </label>
                        <input
                          type="text"
                          value={googleSheetId}
                          onChange={(e) => setGoogleSheetId(e.target.value)}
                          placeholder="วางลิงก์ Google Sheet สำหรับ Two-Way Sync"
                          className="w-full bg-[#fff9eb] border-2 border-[#723b18] px-3 py-2 text-sm text-[#3a1f0f] focus:outline-none focus:border-amber-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-[#4a2612] mb-2">
                        เลือกตัวละครเจ้าของฟาร์ม
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {AVATAR_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              playPixelClick(muted);
                              setFarmerAvatar(opt.id);
                            }}
                            className={`p-3 border-2 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
                              farmerAvatar === opt.id
                                ? 'bg-amber-200 border-[#4a2612] ring-2 ring-amber-500'
                                : 'bg-[#fff9eb] border-[#8e4c1d] hover:bg-amber-100'
                            }`}
                          >
                            <PixelFarmerSprite avatar={opt.id} size={48} />
                            <span className="text-xs font-semibold text-[#3a1f0f]">
                              {opt.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t-2 border-[#e5cfa2]">
                      <button
                        type="button"
                        disabled={creating}
                        onClick={() => setShowNewForm(false)}
                        className="pixel-btn bg-[#e5cfa2] text-[#3a1f0f] font-semibold text-sm px-4 py-2 cursor-pointer disabled:opacity-50"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="submit"
                        disabled={creating}
                        className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white font-bold text-sm px-6 py-2 cursor-pointer disabled:opacity-60"
                      >
                        {creating ? 'กำลังสร้างฟาร์ม...' : 'สร้างและเข้าฟาร์มเลย'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Google Login Popup Modal */}
      {authReady && !currentUser && showLoginPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-login-popup-title"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <div className="pixel-wood-panel w-full max-w-md overflow-hidden shadow-2xl">
            <div className="pixel-wood-header px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#fff5dc]">
                <PixelDuckSprite variant="duckling" size={24} />
                <h3 id="google-login-popup-title" className="font-display text-base font-bold">
                  เข้าสู่ระบบ Google (Popup)
                </h3>
              </div>
              <button
                type="button"
                disabled={authBusy}
                onClick={() => {
                  playPixelClick(muted);
                  setShowLoginPopup(false);
                }}
                className="p-1 text-amber-200 hover:text-white cursor-pointer disabled:opacity-50"
                aria-label="ปิดหน้าต่างเข้าสู่ระบบ"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-4 bg-[#fff9eb]">
              <div className="w-20 h-20 bg-[#f6e3ba] border-2 border-[#723b18] flex items-center justify-center">
                <PixelDuckSprite variant="duckling" size={56} />
              </div>

              <div className="space-y-1.5">
                <h4 className="font-display text-lg font-bold text-[#3a1f0f]">
                  เชื่อมต่อบัญชี Google เพื่อเข้าฟาร์ม
                </h4>
                <p className="text-xs sm:text-sm text-[#5c2e14]">
                  กดปุ่มด้านล่างเพื่อเปิดหน้าต่าง Popup เลือกบัญชี Google ข้อมูลฟาร์มทั้งหมดจะผูกกับบัญชีที่เลือกโดยเฉพาะ
                </p>
              </div>

              {isFirebaseAuthConfigured() ? (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleGoogleLogin}
                  className="gsi-material-button disabled:opacity-60"
                >
                  <div className="gsi-material-button-icon">
                    <GoogleLogoSvg />
                  </div>
                  <span>{authBusy ? 'กำลังเปิดหน้าต่าง Popup...' : 'Sign in with Google'}</span>
                </button>
              ) : (
                <div className="bg-rose-100 border-2 border-rose-700 text-rose-950 px-4 py-2 text-xs font-bold">
                  ยังไม่ได้ตั้งค่า Firebase Auth ในโปรเจกต์นี้
                </div>
              )}

              {authError && (
                <div className="w-full bg-rose-100 border-2 border-rose-700 text-rose-950 px-3 py-2 text-xs font-semibold flex items-start gap-2 text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
