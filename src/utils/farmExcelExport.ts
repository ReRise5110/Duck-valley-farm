import * as XLSX from 'xlsx';
import { FarmData } from '../types/farm';
import { calculateBarnMetrics, calculateFarmOverviewMetrics } from './livestockMetrics';

function fitColumnWidths(rows: Array<Array<string | number | boolean>>): XLSX.ColInfo[] {
  if (rows.length === 0) return [];
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const widths: number[] = Array(colCount).fill(10);

  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const val = row[i];
      const str = val === undefined || val === null ? '' : String(val);
      // Thai combining characters take less horizontal width; keep safe padding
      const len = Math.min(48, Math.max(8, str.length + 3));
      if (len > widths[i]) {
        widths[i] = len;
      }
    }
  }

  return widths.map((wch) => ({ wch }));
}

function appendSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  rows: Array<Array<string | number | boolean>>
) {
  const safeSheetName = sheetName.replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = fitColumnWidths(rows);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
}

export function exportFarmToExcel(farm: FarmData): string {
  const wb = XLSX.utils.book_new();
  const overview = calculateFarmOverviewMetrics(farm.barns);

  const barnNameMap = new Map<string, string>(farm.barns.map((b) => [b.id, b.name]));
  const formulaNameMap = new Map<string, string>(farm.feedFormulas.map((f) => [f.id, f.name]));
  const siloNameMap = new Map<string, string>(farm.feedSilos.map((s) => [s.id, s.name]));

  const totalCulled = farm.barns.reduce((s, b) => s + b.culledDucks, 0);
  const totalMortality = farm.barns.reduce((s, b) => s + b.mortalityDucks, 0);
  const totalInitialDucks = farm.barns.reduce((s, b) => s + b.initialDucks, 0);
  const totalCurrentDucks = farm.barns.reduce((s, b) => s + b.currentDucks, 0);
  const avgSurvivalRatePct =
    totalInitialDucks > 0 ? Number(((totalCurrentDucks / totalInitialDucks) * 100).toFixed(1)) : 0;
  const totalCumFeedKg = farm.barns.reduce((s, b) => s + b.cumulativeFeedKg, 0);
  const totalSiloRemainingKg = farm.feedSilos.reduce((s, s2) => s + s2.remainingKg, 0);
  const totalSalesRevenue = farm.salesRecords.reduce((s, r) => s + r.totalRevenueThb, 0);
  const totalSalesCost = farm.salesRecords.reduce(
    (s, r) =>
      s +
      (r.ducklingCostThb + r.feedCostThb + r.medicineCostThb + r.utilityLaborCostThb),
    0
  );
  const totalSalesProfit = farm.salesRecords.reduce((s, r) => s + r.netProfitThb, 0);

  // 1. ข้อมูลภาพรวมฟาร์ม
  const overviewRows: Array<Array<string | number>> = [
    ['หัวข้อข้อมูลฟาร์ม (Farm Overview)', 'รายละเอียด / ค่า'],
    ['รหัสฟาร์ม (Farm ID)', farm.id],
    ['ชื่อฟาร์ม', farm.name],
    ['ที่ตั้ง / จังหวัด', farm.location || '-'],
    ['ผู้ดูแลฟาร์ม', farm.farmerName || '-'],
    ['ฤดูกาล', farm.season],
    ['วันเลี้ยงของฟาร์ม (Farm Day)', farm.farmDay],
    ['วันที่สร้างข้อมูล', farm.createdAt],
    ['ซิงค์ล่าสุด', farm.lastSyncedAt || '-'],
    ['Google Sheet ID ที่เชื่อมไว้', farm.googleSheetId || '-'],
    ['เปิดแจ้งเตือน LINE Notify', farm.lineNotifyEnabled ? 'เปิด' : 'ปิด'],
    ['', ''],
    ['ตัวชี้วัดภาพรวมฟาร์ม (KPI Summary)', 'ค่า'],
    ['จำนวนโรงเรือนทั้งหมด (เล้า)', farm.barns.length],
    ['เป็ดแรกเข้ารวมทุกโรงเรือน (ตัว)', totalInitialDucks],
    ['เป็ดคงเหลือรวมปัจจุบัน (ตัว)', totalCurrentDucks],
    ['จำนวนเป็ดคัดทิ้งรวม (ตัว)', totalCulled],
    ['จำนวนเป็ดตายสะสมรวม (ตัว)', totalMortality],
    ['อัตราการรอดเฉลี่ย (%)', avgSurvivalRatePct],
    ['ค่า ADG เฉลี่ยฟาร์ม (ก./วัน)', overview.adgGramsPerDay],
    ['ค่า FCR เฉลี่ยฟาร์ม', overview.fcr],
    ['ค่า FE เฉลี่ยฟาร์ม (%)', overview.fePct],
    ['อาหารใช้สะสมในโรงเรือน (กก.)', Number(totalCumFeedKg.toFixed(1))],
    ['อาหารคงเหลือในไซโลรวม (กก.)', Number(totalSiloRemainingKg.toFixed(1))],
    ['จำนวนรายการขาย (ครั้ง)', farm.salesRecords.length],
    ['รายได้จากการขายรวม (บาท)', totalSalesRevenue],
    ['ต้นทุนการผลิตรวมจากการขาย (บาท)', totalSalesCost],
    ['กำไรสุทธิรวมจากการขาย (บาท)', totalSalesProfit],
    ['จำนวนรุ่นที่ปิดแล้ว (รุ่น)', (farm.closedBatches ?? []).length],
    ['จำนวนกิจกรรมในปฏิทิน (รายการ)', farm.calendarEvents.length],
    ['วันที่ส่งออกไฟล์ Excel', new Date().toLocaleString('th-TH')],
  ];
  appendSheet(wb, 'ข้อมูลภาพรวมฟาร์ม', overviewRows);

  // 2. Barns_โรงเรือน
  const barnRows: Array<Array<string | number | boolean>> = [
    [
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'สายพันธุ์เป็ด',
      'พื้นที่ (ตร.ม.)',
      'สถานะ',
      'วันที่เริ่มรุ่น',
      'อายุเป็ด (วัน)',
      'ระยะเวลาเลี้ยง (วัน)',
      'เป็ดแรกเข้า (ตัว)',
      'เป็ดคงเหลือ (ตัว)',
      'คัดทิ้ง (ตัว)',
      'ตายสะสม (ตัว)',
      'อัตรารอด (%)',
      'น้ำหนักแรกเข้า (ก.)',
      'น้ำหนักเฉลี่ยปัจจุบัน (ก.)',
      'ADG ปัจจุบัน (ก./วัน)',
      'Uniformity (%)',
      'อาหารสะสม (กก.)',
      'FCR ปัจจุบัน',
      'FE (%)',
      'น้ำหนักสุ่มชั่งล่าสุด (ก.)',
      'กวาดมูลเป็ด',
      'ล้างขัดโรงเรือน',
      'พ่นฆ่าเชื้อ',
      'พักเล้าแล้ว (วัน)',
      'เป้าหมายพักเล้า (วัน)',
      'FCR ปิดรุ่น',
      'น้ำหนักขายปิดรุ่น (กก.)',
    ],
    ...farm.barns.map((b) => {
      const m = calculateBarnMetrics(b);
      const survivalRatePct =
        b.initialDucks > 0 ? Number(((b.currentDucks / b.initialDucks) * 100).toFixed(1)) : 0;
      return [
        b.id,
        b.name,
        b.breed,
        b.areaSqm,
        b.status,
        b.startDate,
        b.currentCycleDay,
        b.cycleDays,
        b.initialDucks,
        b.currentDucks,
        b.culledDucks,
        b.mortalityDucks,
        survivalRatePct,
        b.initialWeightG,
        b.currentAvgWeightG,
        m.adgGramsPerDay,
        m.uniformityPct,
        b.cumulativeFeedKg,
        m.fcr,
        m.fePct,
        b.sampleWeightsG.join(', '),
        b.cleaningChecklist.muckOut ? 'เสร็จแล้ว' : 'ยังไม่ทำ',
        b.cleaningChecklist.washAndScrub ? 'เสร็จแล้ว' : 'ยังไม่ทำ',
        b.cleaningChecklist.disinfect ? 'เสร็จแล้ว' : 'ยังไม่ทำ',
        b.cleaningChecklist.restDaysCompleted,
        b.cleaningChecklist.targetRestDays,
        b.finalFcr ?? '',
        b.finalSoldWeightKg ?? '',
      ];
    }),
  ];
  appendSheet(wb, 'Barns_โรงเรือน', barnRows);

  // 3. Weight_Logs_น้ำหนัก_ADG
  const weightRows: Array<Array<string | number>> = [
    [
      'รหัสรายการ',
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'วันที่บันทึก',
      'เวลา',
      'อายุเป็ด (วัน)',
      'ค่าน้ำหนักที่บันทึก (กรัม)',
      'น้ำหนักเฉลี่ย (ก.)',
      'ADG (ก./วัน)',
      'Uniformity (%)',
      'หมายเหตุ',
    ],
    ...farm.barns.flatMap((b) =>
      (b.weightLogs || []).map((w) => {
        const adg =
          typeof w.adgGramsPerDay === 'number'
            ? w.adgGramsPerDay
            : w.cycleDay > 0
              ? Number((Math.max(0, w.avgWeightG - b.initialWeightG) / w.cycleDay).toFixed(1))
              : 0;
        return [
          w.id,
          b.id,
          b.name,
          w.date,
          w.timestamp,
          w.cycleDay,
          w.weightsG.join(', '),
          w.avgWeightG,
          adg,
          w.uniformityPct,
          w.note || '',
        ];
      })
    ),
  ];
  appendSheet(wb, 'Weight_Logs_น้ำหนัก_ADG', weightRows);

  // 4. Mortality_Logs_คัดทิ้งตาย
  const mortalityRows: Array<Array<string | number>> = [
    ['รหัสรายการ', 'รหัสโรงเรือน', 'ชื่อโรงเรือน', 'วันที่', 'ประเภท', 'จำนวน (ตัว)', 'สาเหตุ'],
    ...farm.barns.flatMap((b) =>
      (b.mortalityLogs || []).map((m) => [
        m.id,
        b.id,
        b.name,
        m.date,
        m.type === 'CULL' ? 'คัดทิ้ง (CULL)' : 'ตาย (MORTALITY)',
        m.count,
        m.reason,
      ])
    ),
  ];
  appendSheet(wb, 'Mortality_Logs_คัดทิ้งตาย', mortalityRows);

  // 5. FeedFormulas_สูตรอาหาร
  const formulaRows: Array<Array<string | number>> = [
    [
      'รหัสสูตร',
      'ระยะการเลี้ยง',
      'ชื่อสูตรอาหาร',
      'ช่วงอายุ (วัน)',
      'โปรตีน (%)',
      'พลังงาน (kcal/กก.)',
      'ราคา (บาท/กก.)',
      'สัดส่วนวัตถุดิบ',
    ],
    ...farm.feedFormulas.map((f) => [
      f.id,
      f.stage,
      f.name,
      f.ageRangeDays,
      f.proteinPct,
      f.energyKcalPerKg,
      f.pricePerKg,
      f.ingredients.map((ing) => `${ing.name} ${ing.percentage}%`).join(', '),
    ]),
  ];
  appendSheet(wb, 'FeedFormulas_สูตรอาหาร', formulaRows);

  // 6. FeedSilos_ไซโลอาหาร
  const siloRows: Array<Array<string | number>> = [
    [
      'รหัสไซโล',
      'ชื่อไซโล',
      'รหัสสูตรอาหาร',
      'ชื่อสูตรอาหาร',
      'ความจุสูงสุด (กก.)',
      'คงเหลือ (กก.)',
      'คงเหลือ (%)',
      'วันที่จัดเก็บ',
      'อายุการเก็บสูงสุด (วัน)',
    ],
    ...farm.feedSilos.map((s) => [
      s.id,
      s.name,
      s.formulaId,
      formulaNameMap.get(s.formulaId) || s.formulaId,
      s.capacityKg,
      s.remainingKg,
      s.capacityKg > 0 ? Number(((s.remainingKg / s.capacityKg) * 100).toFixed(1)) : 0,
      s.storedDate,
      s.maxShelfLifeDays,
    ]),
  ];
  appendSheet(wb, 'FeedSilos_ไซโลอาหาร', siloRows);

  // 7. Feed_Logs_ให้อาหาร
  const feedLogRows: Array<Array<string | number>> = [
    [
      'รหัสรายการ',
      'วันที่',
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'รหัสไซโล',
      'ชื่อไซโล',
      'ปริมาณ (กก.)',
      'ต้นทุน (บาท)',
      'หักสต็อกอัตโนมัติ',
      'หมายเหตุ',
    ],
    ...farm.feedLogs.map((fl) => [
      fl.id,
      fl.date,
      fl.barnId,
      barnNameMap.get(fl.barnId) || fl.barnId,
      fl.siloId,
      siloNameMap.get(fl.siloId) || fl.siloId,
      fl.amountKg,
      fl.costThb,
      fl.autoDeducted ? 'ใช่' : 'ไม่ใช่',
      fl.note || '',
    ]),
  ];
  appendSheet(wb, 'Feed_Logs_ให้อาหาร', feedLogRows);

  // 8. Environments_สภาพแวดล้อม
  const envRows: Array<Array<string | number>> = [
    [
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'อุณหภูมิ (°C)',
      'ความชื้น (%)',
      'ความเร็วลม (m/s)',
      'แอมโมเนีย (ppm)',
      'เปิดไฟส่องสว่าง',
      'ความเข้มแสง (%)',
      'เวลาเปิดไฟ',
      'เวลาปิดไฟ',
      'เป็นเล้ากกลูกเป็ด',
      'เปิดเครื่องกก',
      'เป้าหมายเครื่องกก (°C)',
      'กำลังไฟเครื่องกก (%)',
      'พฤติกรรมฝูง (Huddling)',
      'ปรับเครื่องกกอัตโนมัติ',
      'หน่วงเวลาตรวจจับ (วินาที)',
    ],
    ...farm.environments.map((e) => [
      e.barnId,
      barnNameMap.get(e.barnId) || e.barnId,
      e.temperatureC,
      e.humidityPct,
      e.windSpeedMs,
      e.ammoniaPpm,
      e.lightOn ? 'เปิด' : 'ปิด',
      e.lightIntensityPct,
      e.lightStartTime,
      e.lightEndTime,
      e.isBroodingBarn ? 'ใช่' : 'ไม่ใช่',
      e.brooderEnabled ? 'เปิด' : 'ปิด',
      e.brooderTargetTempC,
      e.brooderPowerPct,
      e.huddlingState,
      e.autoBrooderEnabled ? 'เปิด' : 'ปิด',
      e.autoBrooderGraceSeconds,
    ]),
  ];
  appendSheet(wb, 'Environments_สภาพแวดล้อม', envRows);

  // 9. Brooder_Logs_เครื่องกก
  const brooderRows: Array<Array<string | number>> = [
    [
      'รหัสรายการ',
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'เวลา',
      'โหมดการทำงาน',
      'สาเหตุการปรับ',
      'อุณหภูมิก่อนปรับ (°C)',
      'อุณหภูมิหลังปรับ (°C)',
    ],
    ...farm.environments.flatMap((e) =>
      (e.autoAdjustLogs || []).map((log) => [
        log.id,
        e.barnId,
        barnNameMap.get(e.barnId) || e.barnId,
        log.timestamp,
        log.mode,
        log.reason,
        log.prevTempC,
        log.newTempC,
      ])
    ),
  ];
  appendSheet(wb, 'Brooder_Logs_เครื่องกก', brooderRows);

  // 10. Calendar_ปฏิทิน
  const calendarRows: Array<Array<string | number>> = [
    [
      'รหัสรายการ',
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'วันที่',
      'หัวข้อกิจกรรม',
      'หมวดหมู่',
      'สติกเกอร์',
      'แจ้งเตือน Google Calendar',
      'แจ้งเตือน LINE',
      'ซิงค์ G-Cal แล้ว',
      'หมายเหตุ',
    ],
    ...farm.calendarEvents.map((c) => [
      c.id,
      c.barnId,
      barnNameMap.get(c.barnId) || c.barnId,
      c.date,
      c.title,
      c.category,
      c.sticker,
      c.notifyGoogleCalendar ? 'ใช่' : 'ไม่ใช่',
      c.notifyLine ? 'ใช่' : 'ไม่ใช่',
      c.syncedToGoogleCalendar ? 'ซิงค์แล้ว' : 'ยังไม่ซิงค์',
      c.notes || '',
    ]),
  ];
  appendSheet(wb, 'Calendar_ปฏิทิน', calendarRows);

  // 11. Sales_รายการขาย
  const salesRows: Array<Array<string | number>> = [
    [
      'รหัสรายการ',
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'รหัสรุ่น (Batch Code)',
      'วันที่ขาย',
      'อายุเลี้ยง (วัน)',
      'จำนวนที่ขาย (ตัว)',
      'น้ำหนักรวม (กก.)',
      'น้ำหนักเฉลี่ย (กก./ตัว)',
      'รูปแบบราคา',
      'ราคาต่อหน่วย (บาท)',
      'ค่าลูกเป็ด (บาท)',
      'ค่าอาหาร (บาท)',
      'ค่ายาและวัคซีน (บาท)',
      'ค่าแรง/น้ำ/ไฟ (บาท)',
      'ต้นทุนรวม (บาท)',
      'ต้นทุนต่อตัว (บาท)',
      'รายได้รวม (บาท)',
      'กำไรสุทธิ (บาท)',
      'ค่า FCR',
      'สถานะ FCR',
      'คุณภาพซาก เกรด A (%)',
      'คุณภาพซาก เกรด B (%)',
      'Feedback ผู้ซื้อ',
      'ปัญหา/ข้อสังเกตในรอบ',
    ],
    ...farm.salesRecords.map((r) => {
      const totalCost =
        r.ducklingCostThb + r.feedCostThb + r.medicineCostThb + r.utilityLaborCostThb;
      const avgWtKg = r.birdsSold > 0 ? Number((r.totalWeightKg / r.birdsSold).toFixed(2)) : 0;
      return [
        r.id,
        r.barnId,
        barnNameMap.get(r.barnId) || r.barnId,
        r.batchCode,
        r.saleDate,
        r.daysRaised,
        r.birdsSold,
        r.totalWeightKg,
        avgWtKg,
        r.pricingMode === 'PER_KG' ? 'บาท/กก.' : 'บาท/ตัว',
        r.pricePerUnit,
        r.ducklingCostThb,
        r.feedCostThb,
        r.medicineCostThb,
        r.utilityLaborCostThb,
        totalCost,
        r.costPerBirdThb,
        r.totalRevenueThb,
        r.netProfitThb,
        r.fcr,
        r.fcrStatus || 'FINAL',
        r.carcassGradeAPct,
        r.carcassGradeBPct,
        r.buyerFeedback,
        r.issuesEncountered,
      ];
    }),
  ];
  appendSheet(wb, 'Sales_รายการขาย', salesRows);

  // 12. Batch_History_ปิดรุ่น
  const batchRows: Array<Array<string | number>> = [
    [
      'รหัสรุ่น',
      'ชื่อรุ่น',
      'รหัสโรงเรือน',
      'ชื่อโรงเรือน',
      'วันที่รับเข้า',
      'วันที่ปิดรุ่น',
      'เป็ดแรกเข้า (ตัว)',
      'เป็ดที่ขายได้ (ตัว)',
      'อัตราการรอด (%)',
      'น้ำหนักขายรวม (กก.)',
      'น้ำหนักเฉลี่ย (กก./ตัว)',
      'อาหารที่ใช้รวม (กก.)',
      'FCR ปิดรุ่น',
      'รายได้รวม (บาท)',
      'ต้นทุนรวม (บาท)',
      'กำไรสุทธิ (บาท)',
    ],
    ...(farm.closedBatches ?? []).map((cb) => [
      cb.id,
      cb.batchName,
      cb.barnId,
      cb.barnName,
      cb.startDate,
      cb.closedDate,
      cb.initialDucks,
      cb.soldDucks,
      cb.survivalRatePct,
      cb.totalSoldWeightKg,
      cb.avgWeightPerBirdKg,
      cb.totalFeedUsedKg,
      cb.finalFcr,
      cb.totalRevenueThb,
      cb.totalCostThb,
      cb.netProfitThb,
    ]),
  ];
  appendSheet(wb, 'Batch_History_ปิดรุ่น', batchRows);

  // 13. Sync_Logs_ประวัติซิงค์
  const syncRows: Array<Array<string | number>> = [
    ['รหัสรายการ', 'เวลา', 'ทิศทาง', 'ช่องทาง', 'สรุปการซิงค์'],
    ...farm.syncLogs.map((s) => [s.id, s.timestamp, s.direction, s.channel, s.summary]),
  ];
  appendSheet(wb, 'Sync_Logs_ประวัติซิงค์', syncRows);

  const safeFarmName = (farm.name || 'Duck_Farm').replace(/[^\w\u0E00-\u0E7F-]+/g, '_');
  const fileName = `${safeFarmName}-ข้อมูลทั้งหมดในฟาร์ม.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}
