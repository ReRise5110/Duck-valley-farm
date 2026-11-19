import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  Upload,
  Download,
  FileSpreadsheet,
  ArrowLeftRight,
  LogOut,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { FarmData } from '../types/farm';
import {
  SheetTabKey,
  SheetWorkbook,
  applyWorkbookToFarm,
  createFarmSpreadsheet,
  csvToRows,
  extractSpreadsheetId,
  farmToWorkbook,
  pullFarmFromGoogleSheet,
  pushFarmToGoogleSheet,
  rowsToCsv,
} from '../services/googleSync';
import {
  clearWorkspaceAccessToken,
  isFirebaseAuthConfigured,
  signInWithGoogleWorkspace,
  signOutGoogleWorkspace,
} from '../services/googleAuth';
import { exportFarmToExcel } from '../utils/farmExcelExport';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

interface TwoWaySyncModalProps {
  farm: FarmData;
  onUpdateFarm: (updater: (prev: FarmData) => FarmData) => void;
  onClose: () => void;
  accessToken: string | null;
  userEmail: string | null;
  onAuthChange: (token: string | null, email: string | null) => void;
  muted: boolean;
}

const TAB_LIST: Array<{ id: SheetTabKey; label: string }> = [
  { id: 'Barns', label: 'Barns (โรงเรือน)' },
  { id: 'Weight_Logs', label: 'Weight_Logs (น้ำหนัก/ADG)' },
  { id: 'Mortality_Logs', label: 'Mortality_Logs (คัดทิ้ง/ตาย)' },
  { id: 'FeedSilos', label: 'FeedSilos (ไซโลอาหาร)' },
  { id: 'Feed_Logs', label: 'Feed_Logs (บันทึกอาหาร)' },
  { id: 'Environments', label: 'Environments (สภาพแวดล้อม)' },
  { id: 'Calendar', label: 'Calendar (ปฏิทิน)' },
  { id: 'Sales', label: 'Sales (สรุปขาย)' },
  { id: 'Batch_History', label: 'Batch_History (ประวัติปิดรุ่น)' },
];

export const TwoWaySyncModal: React.FC<TwoWaySyncModalProps> = ({
  farm,
  onUpdateFarm,
  onClose,
  accessToken,
  userEmail,
  onAuthChange,
  muted,
}) => {
  const [activeTab, setActiveTab] = useState<SheetTabKey>('Barns');
  const [editableWorkbook, setEditableWorkbook] = useState<SheetWorkbook>(() => farmToWorkbook(farm));
  const [sheetInput, setSheetInput] = useState(farm.googleSheetId || '');
  const [webhookInput, setWebhookInput] = useState(farm.appsScriptWebhookUrl || '');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: 'CREATE_GSHEET' | 'PUSH_GSHEET' | 'PULL_GSHEET' | 'APPLY_GRID';
    title: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    setEditableWorkbook(farmToWorkbook(farm));
  }, [farm]);

  useEffect(() => {
    setSheetInput(farm.googleSheetId || '');
  }, [farm.id, farm.googleSheetId]);

  useEffect(() => {
    setWebhookInput(farm.appsScriptWebhookUrl || '');
  }, [farm.id, farm.appsScriptWebhookUrl]);

  const firebaseReady = isFirebaseAuthConfigured();

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await signInWithGoogleWorkspace();
      onAuthChange(res.accessToken, res.user.email || 'Google User');
      playSuccessChime(muted);
      setStatusMsg({ type: 'ok', text: `เข้าสู่ระบบด้วย ${res.user.email} สำเร็จ` });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบ Google ได้',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutGoogleWorkspace();
    onAuthChange(null, null);
    setStatusMsg({ type: 'ok', text: 'ออกจากระบบ Google แล้ว' });
  };

  const handleCreateSheet = async () => {
    if (!accessToken) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const created = await createFarmSpreadsheet(accessToken, farm);
      setSheetInput(created.spreadsheetId);
      onUpdateFarm((prev) => ({
        ...prev,
        googleSheetId: created.spreadsheetId,
        lastSyncedAt: new Date().toLocaleString('th-TH'),
        syncLogs: [
          {
            id: `sync-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('th-TH'),
            direction: 'PUSH',
            channel: 'GOOGLE_SHEETS',
            summary: `สร้าง Google Sheet ใหม่ (${created.spreadsheetId})`,
          },
          ...prev.syncLogs,
        ],
      }));
      playSuccessChime(muted);
      setStatusMsg({ type: 'ok', text: `สร้างและส่งข้อมูลไปยัง Google Sheet (${created.spreadsheetId}) เรียบร้อย!` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'สร้าง Google Sheet ไม่สำเร็จ';
      if (msg.includes('GOOGLE_TOKEN_EXPIRED')) {
        clearWorkspaceAccessToken();
        onAuthChange(null, userEmail);
      }
      setStatusMsg({
        type: 'err',
        text: msg.replace('GOOGLE_TOKEN_EXPIRED: ', ''),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSheetLink = () => {
    const cleaned = extractSpreadsheetId(sheetInput);
    setSheetInput(cleaned);
    onUpdateFarm((prev) => ({
      ...prev,
      googleSheetId: cleaned,
    }));
    playSuccessChime(muted);
    setStatusMsg({
      type: 'ok',
      text: cleaned
        ? `บันทึกลิงก์ Google Sheet (${cleaned}) ไว้ในข้อมูลฟาร์มแล้ว`
        : 'ล้างการเชื่อมโยง Google Sheet ID แล้ว',
    });
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;
    const action = pendingConfirm.action;
    setPendingConfirm(null);
    setBusy(true);
    setStatusMsg(null);

    try {
      if (action === 'CREATE_GSHEET') {
        await handleCreateSheet();
        return;
      }
      if (action === 'APPLY_GRID') {
        onUpdateFarm((prev) => {
          const updated = applyWorkbookToFarm(prev, editableWorkbook);
          return {
            ...updated,
            googleSheetId: extractSpreadsheetId(sheetInput),
            appsScriptWebhookUrl: webhookInput.trim(),
            syncLogs: [
              {
                id: `sync-${Date.now()}`,
                timestamp: new Date().toLocaleTimeString('th-TH'),
                direction: 'PULL',
                channel: 'LOCAL_SHEET',
                summary: `ซิงค์การแก้ไขจากตารางชีต (${activeTab}) เข้าสู่แอปฟาร์ม`,
              },
              ...prev.syncLogs,
            ],
          };
        });
        playSuccessChime(muted);
        setStatusMsg({ type: 'ok', text: 'นำข้อมูลที่แก้ไขในตารางชีตเข้าสู่ระบบฟาร์มเรียบร้อย (Two-Way Sync)' });
      } else if (action === 'PUSH_GSHEET') {
        if (!accessToken) throw new Error('กรุณาเข้าสู่ระบบ Google ก่อน Push ข้อมูล');
        const id = extractSpreadsheetId(sheetInput);
        if (!id) throw new Error('กรุณากรอก Google Sheet ID หรือ URL');
        await pushFarmToGoogleSheet(accessToken, id, farm);
        onUpdateFarm((prev) => ({
          ...prev,
          googleSheetId: id,
          lastSyncedAt: new Date().toLocaleString('th-TH'),
          syncLogs: [
            {
              id: `sync-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('th-TH'),
              direction: 'PUSH',
              channel: 'GOOGLE_SHEETS',
              summary: 'อัปเดตข้อมูลจากแอปไปยัง Google Sheets สำเร็จ',
            },
            ...prev.syncLogs,
          ],
        }));
        playSuccessChime(muted);
        setStatusMsg({ type: 'ok', text: 'Push ข้อมูลฟาร์มขึ้น Google Sheets สำเร็จแล้ว!' });
      } else if (action === 'PULL_GSHEET') {
        if (!accessToken) throw new Error('กรุณาเข้าสู่ระบบ Google ก่อน Pull ข้อมูล');
        const id = extractSpreadsheetId(sheetInput);
        if (!id) throw new Error('กรุณากรอก Google Sheet ID หรือ URL');
        const pulledFarm = await pullFarmFromGoogleSheet(accessToken, id, farm);
        onUpdateFarm(() => ({
          ...pulledFarm,
          googleSheetId: id,
          syncLogs: [
            {
              id: `sync-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('th-TH'),
              direction: 'PULL',
              channel: 'GOOGLE_SHEETS',
              summary: 'ดึงข้อมูลล่าสุดจาก Google Sheets เข้าสู่แอปสำเร็จ',
            },
            ...pulledFarm.syncLogs,
          ],
        }));
        playSuccessChime(muted);
        setStatusMsg({ type: 'ok', text: 'Pull ข้อมูลจาก Google Sheets มาอัปเดตในแอปฟาร์มแล้ว!' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ซิงค์ข้อมูลไม่สำเร็จ';
      if (msg.includes('GOOGLE_TOKEN_EXPIRED')) {
        clearWorkspaceAccessToken();
        onAuthChange(null, userEmail);
      }
      setStatusMsg({
        type: 'err',
        text: msg.replace('GOOGLE_TOKEN_EXPIRED: ', ''),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCellEdit = (rowIdx: number, colIdx: number, value: string) => {
    setEditableWorkbook((prev) => {
      const nextRows = prev[activeTab].map((r, rI) =>
        rI === rowIdx ? r.map((c, cI) => (cI === colIdx ? value : c)) : r
      );
      return { ...prev, [activeTab]: nextRows };
    });
  };

  const handleDownloadCsv = () => {
    playPixelClick(muted);
    const csv = rowsToCsv(editableWorkbook[activeTab]);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${farm.name}-${activeTab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = () => {
    playSuccessChime(muted);
    const fileName = exportFarmToExcel(farm);
    setStatusMsg({
      type: 'ok',
      text: `ส่งออกไฟล์ Excel "${fileName}" (รวมข้อมูลทั้งหมดในฟาร์ม 13 ชีต) เรียบร้อยแล้ว`,
    });
  };

  const handleUploadCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = csvToRows(text);
      if (parsed.length > 1) {
        const nextWb = { ...editableWorkbook, [activeTab]: parsed };
        setEditableWorkbook(nextWb);
        onUpdateFarm((prev) => applyWorkbookToFarm(prev, { [activeTab]: parsed }));
        playSuccessChime(muted);
        setStatusMsg({
          type: 'ok',
          text: `นำเข้าไฟล์ CSV (${parsed.length - 1} แถว) เข้าแท็บ ${activeTab} และอัปเดตแอปแล้ว`,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleWebhookSync = async (action: 'pull' | 'push') => {
    if (!webhookInput.trim()) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/sheets/webhook-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: webhookInput.trim(),
          action,
          payload: action === 'push' ? { farmId: farm.id, workbook: editableWorkbook } : undefined,
        }),
      });
      const json = (await res.json()) as { ok: boolean; data?: Partial<SheetWorkbook>; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Apps Script Webhook ตอบกลับผิดพลาด');
      }
      if (action === 'pull' && json.data) {
        onUpdateFarm((prev) => applyWorkbookToFarm({ ...prev, appsScriptWebhookUrl: webhookInput.trim() }, json.data!));
      } else {
        onUpdateFarm((prev) => ({ ...prev, appsScriptWebhookUrl: webhookInput.trim() }));
      }
      playSuccessChime(muted);
      setStatusMsg({
        type: 'ok',
        text: action === 'push' ? 'ส่งข้อมูลผ่าน Apps Script Webhook สำเร็จ' : 'ดึงข้อมูลจาก Webhook สำเร็จ',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'เชื่อมต่อ Webhook ไม่สำเร็จ',
      });
    } finally {
      setBusy(false);
    }
  };

  const currentRows = editableWorkbook[activeTab] || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="pixel-wood-panel w-full max-w-6xl max-h-[88vh] flex flex-col overflow-y-auto relative">
        {/* Header */}
        <div className="pixel-wood-header px-5 py-3.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <ArrowLeftRight className="w-5 h-5 text-emerald-300" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#fff5dc]">
                Two-Way Sync · Google Sheets & ตารางข้อมูลฟาร์ม
              </h2>
              <p className="text-xs text-amber-200/90">
                แก้ไขข้อมูลได้ทั้ง 2 ทาง (จากหน้าเกมฟาร์ม หรือจากตาราง Google Sheets) · ซิงค์ล่าสุด: {farm.lastSyncedAt}
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

        {/* Confirmation Dialog for Mutating Operations */}
        {pendingConfirm && (
          <div className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-4">
            <div className="pixel-wood-panel max-w-md w-full p-5 space-y-4">
              <h3 className="font-display font-bold text-lg text-[#3a1f0f]">
                {pendingConfirm.title}
              </h3>
              <p className="text-sm text-[#5c2e14]">{pendingConfirm.description}</p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="pixel-btn bg-[#e5cfa2] text-[#3a1f0f] text-xs font-bold px-4 py-2 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={executeConfirmedAction}
                  className="pixel-btn bg-[#4ea832] text-white text-xs font-bold px-4 py-2 cursor-pointer"
                >
                  ยืนยันดำเนินการ
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {statusMsg && (
            <div
              className={`border-2 px-4 py-2.5 text-xs font-bold flex items-center gap-2 ${
                statusMsg.type === 'ok'
                  ? 'bg-emerald-100 border-emerald-700 text-emerald-950'
                  : 'bg-rose-100 border-rose-700 text-rose-950'
              }`}
            >
              {statusMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Google Workspace OAuth & Sheet Link Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="pixel-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold text-sm text-[#3a1f0f] flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  เชื่อมต่อบัญชี Google (Sheets & Calendar)
                </h3>
                {accessToken && userEmail ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleGoogleSignIn}
                      className="text-xs font-bold text-sky-800 hover:underline cursor-pointer"
                    >
                      ขอสิทธิ์ใหม่
                    </button>
                    <button
                      type="button"
                      onClick={handleGoogleSignOut}
                      className="text-xs font-bold text-rose-800 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      ออกจากระบบ ({userEmail})
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleGoogleSignIn}
                    className="gsi-material-button"
                  >
                    <div className="gsi-material-button-icon">
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
                    </div>
                    <span>{userEmail ? 'อนุญาตสิทธิ์ Google Sheets' : 'Sign in with Google'}</span>
                  </button>
                )}
              </div>

              {userEmail && !accessToken && (
                <div className="bg-amber-50 border border-amber-500 px-2.5 py-2 text-[11px] font-semibold text-amber-950 space-y-1">
                  <div>
                    ขั้นตอนที่ 1: เข้าสู่ระบบบัญชี {userEmail} แล้ว — กดปุ่ม{' '}
                    <strong>&quot;อนุญาตสิทธิ์ Google Sheets&quot;</strong> ด้านบนเพื่อรับสิทธิ์สร้างและซิงค์ไฟล์ Google Sheet
                  </div>
                </div>
              )}

              {accessToken && userEmail && (
                <div className="bg-emerald-50 border border-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-emerald-950 flex flex-wrap items-center justify-between gap-2">
                  <span>พร้อมซิงค์ Google Sheets & Calendar แล้ว: {userEmail}</span>
                  {extractSpreadsheetId(sheetInput) && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(sheetInput)}/edit`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-800 underline hover:text-emerald-950"
                    >
                      เปิด Google Sheet
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {!firebaseReady && (
                <p className="text-[11px] text-[#723b18] bg-amber-50 border border-amber-400 p-2">
                  หมายเหตุ: ระบบยืนยันตัวตน Google ยังไม่พร้อมใช้งานในสภาพแวดล้อมนี้ — คุณยังสามารถใช้ตารางซิงค์ 2 ทางด้านล่าง, Export/Import CSV และ Apps Script Webhook ได้ทันที
                </p>
              )}

              <div className="space-y-2 text-xs">
                <label className="font-bold block">Google Sheet ID หรือ URL</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    placeholder="วางลิงก์ https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 min-w-0 bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSaveSheetLink}
                    className="pixel-btn bg-[#ebd2a2] hover:bg-[#e1c082] disabled:opacity-50 text-[#3a1f0f] font-bold px-3 py-1.5 cursor-pointer whitespace-nowrap"
                  >
                    บันทึกลิงก์
                  </button>
                  <button
                    type="button"
                    disabled={!accessToken || busy}
                    onClick={() =>
                      setPendingConfirm({
                        action: 'CREATE_GSHEET',
                        title: 'ยืนยันสร้างไฟล์ Google Sheet ใหม่?',
                        description: `ระบบจะสร้างไฟล์ Google Sheet ใหม่ใน Google Drive ของคุณ พร้อมบันทึกข้อมูลฟาร์ม "${farm.name}" ทั้ง 9 แท็บ (โรงเรือน, ประวัติน้ำหนัก/ADG, คัดทิ้ง/ตาย, ไซโล, บันทึกอาหาร, สภาพแวดล้อม, ปฏิทิน, ยอดขาย, ประวัติปิดรุ่น) ลงในไฟล์ทันที`,
                      })
                    }
                    className="pixel-btn bg-emerald-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 cursor-pointer whitespace-nowrap"
                  >
                    {busy ? 'กำลังดำเนินการ...' : 'สร้าง Sheet ใหม่ & บันทึก'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={!accessToken || busy || !extractSpreadsheetId(sheetInput)}
                    onClick={() =>
                      setPendingConfirm({
                        action: 'PUSH_GSHEET',
                        title: 'ยืนยันบันทึกข้อมูลลง Google Sheets?',
                        description:
                          'การดำเนินการนี้จะอัปเดตข้อมูลทั้ง 9 แท็บ (Barns, Weight_Logs, Mortality_Logs, FeedSilos, Feed_Logs, Environments, Calendar, Sales, Batch_History) ใน Google Sheet ของคุณให้ตรงกับแอปฟาร์ม',
                      })
                    }
                    className="pixel-btn bg-[#e69128] disabled:opacity-50 text-[#2b180e] font-bold px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    บันทึกข้อมูลลง Google Sheet (Push)
                  </button>
                  <button
                    type="button"
                    disabled={!accessToken || busy || !extractSpreadsheetId(sheetInput)}
                    onClick={() =>
                      setPendingConfirm({
                        action: 'PULL_GSHEET',
                        title: 'ยืนยันดึงข้อมูลจาก Google Sheets?',
                        description:
                          'ข้อมูลโรงเรือน ประวัติน้ำหนัก คัดทิ้ง/ตาย สต็อกไซโล บันทึกอาหาร สภาพแวดล้อม ปฏิทิน และประวัติรุ่นที่ปิดแล้ว ในแอปจะถูกอัปเดตตามค่าล่าสุดที่กรอกไว้ใน Google Sheet',
                      })
                    }
                    className="pixel-btn bg-sky-600 disabled:opacity-50 text-white font-bold px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    ดึงข้อมูลจาก Google Sheet (Pull)
                  </button>
                </div>
              </div>
            </div>

            {/* Apps Script Webhook + CSV Bridge */}
            <div className="pixel-card p-4 space-y-3 text-xs">
              <h3 className="font-display font-bold text-sm text-[#3a1f0f]">
                ซิงค์ทางเลือก: Apps Script Webhook / ไฟล์ CSV สำหรับ Google Sheets
              </h3>
              <div>
                <label className="font-bold block mb-1">Google Apps Script Web App URL (ถ้ามี)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={webhookInput}
                    onChange={(e) => setWebhookInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 bg-white border-2 border-[#723b18] px-2.5 py-1.5"
                  />
                  <button
                    type="button"
                    disabled={busy || !webhookInput.trim()}
                    onClick={() => handleWebhookSync('push')}
                    className="pixel-btn bg-amber-500 disabled:opacity-50 text-[#2b180e] font-bold px-3 py-1.5 cursor-pointer"
                  >
                    Push
                  </button>
                  <button
                    type="button"
                    disabled={busy || !webhookInput.trim()}
                    onClick={() => handleWebhookSync('pull')}
                    className="pixel-btn bg-sky-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 cursor-pointer"
                  >
                    Pull
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#e5cfa2]">
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="pixel-btn bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  ส่งออก Excel ข้อมูลทั้งหมดในฟาร์ม (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="pixel-btn bg-[#fff9eb] text-[#3a1f0f] font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  ส่งออกแท็บ {activeTab} เป็น CSV
                </button>
                <label className="pixel-btn bg-[#4ea832] text-white font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  นำเข้า CSV จาก Google Sheets
                  <input type="file" accept=".csv,text/csv" onChange={handleUploadCsv} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          {/* Interactive Two-Way Spreadsheet Grid */}
          <div className="pixel-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {TAB_LIST.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      playPixelClick(muted);
                      setActiveTab(t.id);
                    }}
                    className={`px-3 py-1.5 text-xs font-bold border-2 cursor-pointer ${
                      activeTab === t.id
                        ? 'bg-[#4a2612] text-[#fff5dc] border-[#2b180e]'
                        : 'bg-[#fff9eb] text-[#4a2612] border-[#8e4c1d]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {activeTab !== 'Sales' && (
                <button
                  type="button"
                  onClick={() =>
                    setPendingConfirm({
                      action: 'APPLY_GRID',
                      title: 'ยืนยันซิงค์ข้อมูลจากตารางชีตเข้าสู่แอป?',
                      description: `การแก้ไขในตารางแท็บ ${activeTab} จะถูกบันทึกเข้าสู่ข้อมูลฟาร์ม ${farm.name} ทันที`,
                    })
                  }
                  className="pixel-btn bg-[#4ea832] hover:bg-[#429229] text-white text-xs font-bold px-4 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  บันทึกการแก้ไขจากตารางชีต → แอปฟาร์ม
                </button>
              )}
            </div>

            <div className="overflow-x-auto border-2 border-[#723b18] bg-white max-h-72">
              <table className="w-full min-w-[540px] text-xs border-collapse tabular-nums">
                <tbody>
                  {currentRows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className={rowIdx === 0 ? 'bg-[#ebd2a2] font-bold sticky top-0' : 'hover:bg-amber-50'}
                    >
                      <td className="border border-[#d6b680] px-2 py-1 text-[10px] text-[#723b18] bg-[#f6e3ba] font-mono-num w-8 text-center">
                        {rowIdx === 0 ? '#' : rowIdx}
                      </td>
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} className="border border-[#d6b680] p-0 min-w-[110px]">
                          {rowIdx === 0 || colIdx === 0 || activeTab === 'Sales' ? (
                            <div className="px-2 py-1.5 truncate font-mono-num">{cell}</div>
                          ) : (
                            <input
                              type="text"
                              value={cell}
                              onChange={(e) => handleCellEdit(rowIdx, colIdx, e.target.value)}
                              className="w-full px-2 py-1.5 bg-transparent focus:bg-amber-100 focus:outline-none font-mono-num"
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Sync Activity Log */}
          {farm.syncLogs.length > 0 && (
            <div className="pixel-card p-3.5 space-y-2 text-xs">
              <div className="font-display font-bold text-[#3a1f0f]">
                ประวัติการซิงค์ล่าสุด ({Math.min(5, farm.syncLogs.length)} รายการ)
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {farm.syncLogs.slice(0, 5).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-2 bg-[#f3e1b9] px-2.5 py-1 border border-[#d6b680]"
                  >
                    <span className="truncate font-medium text-[#3a1f0f]">
                      [{log.channel}] {log.summary}
                    </span>
                    <span className="font-mono-num text-[11px] text-[#723b18] shrink-0">
                      {log.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
