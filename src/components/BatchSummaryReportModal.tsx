import React, { useMemo, useState } from 'react';
import { X, Printer, FileDown, Award, CheckCircle2, Calendar, Scale, Coins, TrendingUp } from 'lucide-react';
import { ClosedBatch, FarmData } from '../types/farm';
import {
  computeBatchReportMetrics,
  exportBatchSummaryToPdf,
  findMatchingSaleForBatch,
} from '../utils/batchReportPdf';
import { playPixelClick, playSuccessChime } from '../utils/soundFx';

interface BatchSummaryReportModalProps {
  farm: FarmData;
  batch: ClosedBatch;
  onClose: () => void;
  muted: boolean;
}

export const BatchSummaryReportModal: React.FC<BatchSummaryReportModalProps> = ({
  farm,
  batch,
  onClose,
  muted,
}) => {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);

  const matchedSale = useMemo(() => findMatchingSaleForBatch(farm, batch), [farm, batch]);
  const metrics = useMemo(
    () => computeBatchReportMetrics(batch, matchedSale),
    [batch, matchedSale]
  );

  const handlePrint = () => {
    playPixelClick(muted);
    window.print();
  };

  const handleSavePdf = async () => {
    playPixelClick(muted);
    setExportingPdf(true);
    setPdfMsg(null);
    try {
      await exportBatchSummaryToPdf(farm, batch, matchedSale);
      playSuccessChime(muted);
      setPdfMsg(`บันทึกไฟล์ PDF "สรุปผลงานประจำรุ่น-${batch.batchName}.pdf" เรียบร้อยแล้ว`);
    } catch (err) {
      setPdfMsg(
        err instanceof Error ? err.message : 'ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองกดสั่งพิมพ์แทน'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:static print:bg-white print:p-0">
      <div className="pixel-wood-panel w-full max-w-4xl max-h-[88vh] flex flex-col overflow-y-auto print:max-h-none print:overflow-visible print:border-0 print:shadow-none print:bg-white">
        {/* Non-printable Toolbar Header */}
        <div className="pixel-wood-header px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#fff5dc]">
              สรุปผลงานประจำรุ่น
            </h2>
            <p className="text-xs text-amber-200/90">
              {batch.batchName} · {batch.barnName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="pixel-btn bg-[#fff9eb] hover:bg-amber-100 text-[#3a1f0f] text-xs font-bold px-3.5 py-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              สั่งพิมพ์ (Print)
            </button>
            <button
              type="button"
              disabled={exportingPdf}
              onClick={handleSavePdf}
              className="pixel-btn bg-[#4ea832] hover:bg-[#429229] disabled:opacity-60 text-white text-xs font-bold px-3.5 py-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-4 h-4" />
              {exportingPdf ? 'กำลังสร้าง PDF...' : 'เซฟเป็น PDF'}
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

        {pdfMsg && (
          <div className="bg-emerald-100 border-b-2 border-emerald-700 px-5 py-2 text-xs font-bold text-emerald-950 flex items-center justify-between gap-2 print:hidden">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              {pdfMsg}
            </span>
            <button type="button" onClick={() => setPdfMsg(null)} className="underline cursor-pointer">
              ปิด
            </button>
          </div>
        )}

        {/* Single-Page Printable Sheet */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-[#f6e3ba] print:bg-white print:p-0 print:overflow-visible">
          <div
            id="batch-summary-printable"
            className="bg-[#fffdf7] border-4 border-[#4a2612] p-5 sm:p-7 space-y-5 text-[#3a1f0f] shadow-md print:shadow-none print:border-2 print:p-5"
          >
            {/* Farm & Report Header */}
            <div className="border-b-4 border-[#4a2612] pb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#8e4c1d]">
                  Duck Valley Farm · Batch Performance Report
                </div>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-[#3a1f0f] mt-0.5">
                  สรุปผลงานประจำรุ่น
                </h3>
                <div className="text-xs text-[#5c2e14] mt-1">
                  <strong>{farm.name}</strong> · {farm.location} · ผู้ดูแล: {farm.farmerName}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="font-display font-bold text-base text-[#3a1f0f]">
                  {batch.batchName}
                </div>
                <div className="text-xs text-[#723b18]">{batch.barnName}</div>
                <div>
                  <span
                    className={`inline-block text-xs font-bold px-2.5 py-0.5 border-2 ${metrics.fcrGrade.tailwindClass}`}
                  >
                    FCR {batch.finalFcr.toFixed(2)} · {metrics.fcrGrade.label}
                  </span>
                </div>
              </div>
            </div>

            {/* 6 Core Requested Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 tabular-nums">
              <div className="bg-[#fbf0d4] border-2 border-[#723b18] p-3">
                <div className="text-[11px] font-bold text-[#723b18] flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  วันที่เข้า – ออก
                </div>
                <div className="font-mono-num text-sm sm:text-base font-bold text-[#3a1f0f] mt-1">
                  {batch.startDate} → {batch.closedDate}
                </div>
                <div className="text-[11px] text-[#5c2e14] mt-0.5">
                  เลี้ยงทั้งหมด {metrics.daysRaised} วัน
                </div>
              </div>

              <div className="bg-[#fbf0d4] border-2 border-[#723b18] p-3">
                <div className="text-[11px] font-bold text-[#723b18] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  อัตราการรอด (%)
                </div>
                <div className="font-mono-num text-xl font-bold text-emerald-800 mt-0.5">
                  {batch.survivalRatePct.toFixed(1)}%
                </div>
                <div className="text-[11px] text-[#5c2e14] mt-0.5">
                  ขายได้ {batch.soldDucks.toLocaleString()} / {batch.initialDucks.toLocaleString()} ตัว
                </div>
              </div>

              <div className="bg-[#fbf0d4] border-2 border-[#723b18] p-3">
                <div className="text-[11px] font-bold text-[#723b18] flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5" />
                  น้ำหนักเฉลี่ย
                </div>
                <div className="font-mono-num text-xl font-bold text-[#3a1f0f] mt-0.5">
                  {batch.avgWeightPerBirdKg.toFixed(2)} กก./ตัว
                </div>
                <div className="text-[11px] text-[#5c2e14] mt-0.5">
                  น้ำหนักขายรวม {batch.totalSoldWeightKg.toLocaleString()} กก.
                </div>
              </div>

              <div className="bg-[#fbf0d4] border-2 border-[#723b18] p-3">
                <div className="text-[11px] font-bold text-[#723b18] flex items-center justify-between gap-1">
                  <span>ค่า FCR ปิดรุ่น</span>
                  <span className={`text-[10px] px-1.5 py-0.5 border ${metrics.fcrGrade.tailwindClass}`}>
                    {metrics.fcrGrade.label}
                  </span>
                </div>
                <div className="font-mono-num text-xl font-bold text-[#3a1f0f] mt-0.5">
                  {batch.finalFcr.toFixed(2)}
                </div>
                <div className="text-[11px] text-[#5c2e14] mt-0.5">
                  อาหารรวม {batch.totalFeedUsedKg.toLocaleString()} กก.
                </div>
              </div>

              <div className="bg-[#fbf0d4] border-2 border-[#723b18] p-3">
                <div className="text-[11px] font-bold text-[#723b18] flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-700" />
                  ต้นทุนต่อ กก.
                </div>
                <div className="font-mono-num text-xl font-bold text-rose-900 mt-0.5">
                  ฿{metrics.costPerKg.toFixed(2)} / กก.
                </div>
                <div className="text-[11px] text-[#5c2e14] mt-0.5">
                  ต้นทุน/ตัว ฿{metrics.costPerBird.toFixed(2)}
                </div>
              </div>

              <div className="bg-[#fbf0d4] border-2 border-[#723b18] p-3">
                <div className="text-[11px] font-bold text-[#723b18] flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                  กำไรสุทธิ
                </div>
                <div
                  className={`font-mono-num text-xl font-bold mt-0.5 ${
                    batch.netProfitThb >= 0 ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  ฿{batch.netProfitThb.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#5c2e14] mt-0.5">
                  รายได้ ฿{batch.totalRevenueThb.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 2-Column Detailed Breakdown Tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tabular-nums">
              <div className="border-2 border-[#723b18] overflow-x-auto">
                <div className="bg-[#ebd2a2] px-3.5 py-2 font-display font-bold text-xs text-[#3a1f0f] border-b-2 border-[#723b18]">
                  ข้อมูลฝูงและสมรรถภาพการเลี้ยง
                </div>
                <table className="w-full min-w-[320px] text-xs border-collapse">
                  <tbody>
                    <tr className="border-b border-[#e5cfa2]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">วันที่รับเข้า – วันที่ปิดรุ่น</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        {batch.startDate} → {batch.closedDate}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2] bg-[#fff9eb]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">จำนวนเป็ดแรกเข้า</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        {batch.initialDucks.toLocaleString()} ตัว
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">จำนวนเป็ดที่ขายได้</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        {batch.soldDucks.toLocaleString()} ตัว
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2] bg-[#fff9eb]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">คัดทิ้ง / สูญเสียตลอดรุ่น</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold text-rose-800">
                        {metrics.lostDucks.toLocaleString()} ตัว
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">อัตราการรอด (%)</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold text-emerald-800">
                        {batch.survivalRatePct.toFixed(1)}%
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2] bg-[#fff9eb]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">น้ำหนักขายรวม / เฉลี่ยต่อตัว</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        {batch.totalSoldWeightKg.toLocaleString()} กก. ({batch.avgWeightPerBirdKg.toFixed(2)} กก.)
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-[#5c2e14]">อาหารที่ใช้รวม / ค่า FCR / FE</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        {batch.totalFeedUsedKg.toLocaleString()} กก. · FCR {batch.finalFcr.toFixed(2)} (
                        {metrics.feedEfficiencyPct.toFixed(1)}%)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="border-2 border-[#723b18] overflow-x-auto">
                <div className="bg-[#ebd2a2] px-3.5 py-2 font-display font-bold text-xs text-[#3a1f0f] border-b-2 border-[#723b18]">
                  สรุปต้นทุนและผลตอบแทนทางการเงิน
                </div>
                <table className="w-full min-w-[320px] text-xs border-collapse">
                  <tbody>
                    <tr className="border-b border-[#e5cfa2]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">รายได้จากการขายรวม</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        ฿{batch.totalRevenueThb.toLocaleString()}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2] bg-[#fff9eb]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">รายได้เฉลี่ยต่อ กก.</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        ฿{metrics.revenuePerKg.toFixed(2)} / กก.
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">ต้นทุนการผลิตรวมทั้งหมด</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        ฿{batch.totalCostThb.toLocaleString()}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2] bg-[#fff9eb]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">ต้นทุนต่อ กก. (Cost / Kg)</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold text-rose-900">
                        ฿{metrics.costPerKg.toFixed(2)} / กก.
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">ต้นทุนเฉลี่ยต่อตัว</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        ฿{metrics.costPerBird.toFixed(2)} / ตัว
                      </td>
                    </tr>
                    <tr className="border-b border-[#e5cfa2] bg-[#fff9eb]">
                      <td className="px-3 py-1.5 text-[#5c2e14]">กำไรต่อ กก. / กำไรต่อตัว</td>
                      <td className="px-3 py-1.5 text-right font-mono-num font-bold">
                        ฿{metrics.profitPerKg.toFixed(2)}/กก. · ฿{metrics.profitPerBird.toFixed(2)}/ตัว
                      </td>
                    </tr>
                    <tr className="bg-[#f3e1b9]">
                      <td className="px-3 py-1.5 font-bold text-[#3a1f0f]">กำไรสุทธิประจำรุ่น</td>
                      <td
                        className={`px-3 py-1.5 text-right font-mono-num font-bold ${
                          batch.netProfitThb >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        ฿{batch.netProfitThb.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Optional Carcass & Field Notes */}
            {matchedSale && (
              <div className="bg-[#fbf0d4] border-2 border-[#c68443] p-3 text-xs space-y-1.5">
                <div className="font-display font-bold text-[#3a1f0f] flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-700" />
                  คุณภาพซาก (เกรด A {matchedSale.carcassGradeAPct}% / เกรด B {matchedSale.carcassGradeBPct}%)
                </div>
                <div className="text-[#4a2612]">
                  <strong>Feedback:</strong> {matchedSale.buyerFeedback}
                </div>
                <div className="text-[#5c2e14]">
                  <strong>ข้อสังเกตในรอบผลิต:</strong> {matchedSale.issuesEncountered}
                </div>
              </div>
            )}

            {/* Print Sign-off Footer */}
            <div className="pt-4 border-t-2 border-[#d6b680] grid grid-cols-2 gap-8 text-center text-xs text-[#5c2e14]">
              <div className="space-y-6">
                <div className="border-b border-[#8e4c1d] mx-6" />
                <div>ผู้บันทึกข้อมูล ({farm.farmerName})</div>
              </div>
              <div className="space-y-6">
                <div className="border-b border-[#8e4c1d] mx-6" />
                <div>ผู้ตรวจสอบ / เจ้าของฟาร์ม</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
