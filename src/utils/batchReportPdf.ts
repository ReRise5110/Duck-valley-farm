import { jsPDF } from 'jspdf';
import { ClosedBatch, FarmData, SalesRecord } from '../types/farm';

export interface BatchComputedReport {
  daysRaised: number;
  lostDucks: number;
  costPerKg: number;
  revenuePerKg: number;
  profitPerKg: number;
  costPerBird: number;
  profitPerBird: number;
  feedEfficiencyPct: number;
  fcrGrade: {
    label: string;
    colorHex: string;
    bgHex: string;
    borderHex: string;
    tailwindClass: string;
  };
}

export function findMatchingSaleForBatch(
  farm: FarmData,
  batch: ClosedBatch
): SalesRecord | undefined {
  return farm.salesRecords.find(
    (r) =>
      r.barnId === batch.barnId &&
      (r.batchCode === batch.batchName || r.saleDate === batch.closedDate)
  );
}

export function computeBatchReportMetrics(
  batch: ClosedBatch,
  matchedSale?: SalesRecord
): BatchComputedReport {
  let daysRaised = matchedSale?.daysRaised || 0;
  if (!daysRaised && batch.startDate && batch.closedDate) {
    const startMs = new Date(`${batch.startDate}T00:00:00`).getTime();
    const endMs = new Date(`${batch.closedDate}T00:00:00`).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      daysRaised = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
    }
  }
  if (!daysRaised) daysRaised = 1;

  const lostDucks = Math.max(0, batch.initialDucks - batch.soldDucks);
  const costPerKg =
    batch.totalSoldWeightKg > 0 ? batch.totalCostThb / batch.totalSoldWeightKg : 0;
  const revenuePerKg =
    batch.totalSoldWeightKg > 0 ? batch.totalRevenueThb / batch.totalSoldWeightKg : 0;
  const profitPerKg =
    batch.totalSoldWeightKg > 0 ? batch.netProfitThb / batch.totalSoldWeightKg : 0;
  const costPerBird = batch.soldDucks > 0 ? batch.totalCostThb / batch.soldDucks : 0;
  const profitPerBird = batch.soldDucks > 0 ? batch.netProfitThb / batch.soldDucks : 0;
  const feedEfficiencyPct = batch.finalFcr > 0 ? (1 / batch.finalFcr) * 100 : 0;

  let fcrGrade: BatchComputedReport['fcrGrade'];
  if (batch.finalFcr <= 0) {
    fcrGrade = {
      label: 'ไม่มีข้อมูลน้ำหนักขาย',
      colorHex: '#44403c',
      bgHex: '#f5f5f4',
      borderHex: '#78716c',
      tailwindClass: 'bg-stone-100 text-stone-800 border-stone-500',
    };
  } else if (batch.finalFcr <= 2.2) {
    fcrGrade = {
      label: 'ดีเยี่ยม',
      colorHex: '#065f46',
      bgHex: '#d1fae5',
      borderHex: '#047857',
      tailwindClass: 'bg-emerald-100 text-emerald-900 border-emerald-700',
    };
  } else if (batch.finalFcr <= 2.45) {
    fcrGrade = {
      label: 'ตามเกณฑ์',
      colorHex: '#92400e',
      bgHex: '#fef3c7',
      borderHex: '#b45309',
      tailwindClass: 'bg-amber-100 text-amber-900 border-amber-700',
    };
  } else {
    fcrGrade = {
      label: 'ควรปรับปรุง',
      colorHex: '#9f1239',
      bgHex: '#ffe4e6',
      borderHex: '#be123c',
      tailwindClass: 'bg-rose-100 text-rose-900 border-rose-700',
    };
  }

  return {
    daysRaised,
    lostDucks,
    costPerKg,
    revenuePerKg,
    profitPerKg,
    costPerBird,
    profitPerBird,
    feedEfficiencyPct,
    fcrGrade,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
  lineWidth = 2
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y, w, h);
  }
}

function drawTruncatedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2
) {
  const words = text.split(/\s+/);
  let line = '';
  let currentY = y;
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
      lineCount++;
      if (lineCount >= maxLines - 1) {
        let remainder = [line, ...words.slice(i + 1)].join(' ');
        while (ctx.measureText(`${remainder}…`).width > maxWidth && remainder.length > 4) {
          remainder = remainder.slice(0, -1);
        }
        ctx.fillText(
          remainder.length < [line, ...words.slice(i + 1)].join(' ').length
            ? `${remainder}…`
            : remainder,
          x,
          currentY
        );
        return;
      }
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

export async function exportBatchSummaryToPdf(
  farm: FarmData,
  batch: ClosedBatch,
  matchedSale?: SalesRecord
): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await Promise.all([
        document.fonts.load('500 18px "IBM Plex Sans Thai"'),
        document.fonts.load('600 18px "IBM Plex Sans Thai"'),
        document.fonts.load('700 20px "IBM Plex Sans Thai"'),
        document.fonts.load('700 22px "Chakra Petch"'),
        document.fonts.load('700 24px "JetBrains Mono"'),
      ]);
      await document.fonts.ready;
    } catch {
      await document.fonts.ready;
    }
  }

  const metrics = computeBatchReportMetrics(batch, matchedSale);
  const canvas = document.createElement('canvas');
  // A4 portrait at 150 DPI
  const W = 1240;
  const H = 1754;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ไม่สามารถสร้าง Canvas สำหรับ PDF ได้');

  const fontBody = `'IBM Plex Sans Thai', sans-serif`;
  const fontDisplay = `'Chakra Petch', 'IBM Plex Sans Thai', sans-serif`;

  // Page Background
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, W, H);

  // Outer Frame
  drawRoundedRect(ctx, 44, 44, W - 88, H - 88, '#fffdf7', '#4a2612', 4);

  // Header Banner
  drawRoundedRect(ctx, 44, 44, W - 88, 178, '#7c3f16', '#4a2612', 4);
  ctx.fillStyle = '#fff5dc';
  ctx.font = `700 34px ${fontDisplay}`;
  ctx.fillText('สรุปผลงานประจำรุ่น', 82, 108, W - 164);

  ctx.fillStyle = '#fde68a';
  ctx.font = `600 21px ${fontBody}`;
  ctx.fillText(`${farm.name} · ${farm.location} · ผู้ดูแล: ${farm.farmerName}`, 82, 148, W - 164);

  ctx.fillStyle = '#fef3c7';
  ctx.font = `500 18px ${fontBody}`;
  const printedDate = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  ctx.fillText(`พิมพ์เอกสารเมื่อ: ${printedDate}`, 82, 186, W - 164);

  // Batch Title Strip
  drawRoundedRect(ctx, 76, 248, W - 152, 92, '#fbf0d4', '#8e4c1d', 3);
  const badgeW = 290;
  const badgeX = W - 102 - badgeW;
  const titleMaxW = badgeX - 118;

  ctx.fillStyle = '#3a1f0f';
  ctx.font = `700 28px ${fontDisplay}`;
  ctx.fillText(`รุ่นการเลี้ยง: ${batch.batchName}`, 102, 290, titleMaxW);
  ctx.fillStyle = '#723b18';
  ctx.font = `600 20px ${fontBody}`;
  ctx.fillText(`โรงเรือน: ${batch.barnName}`, 102, 323, titleMaxW);

  // FCR Grade Badge on top-right of Batch Title Strip
  const badgeY = 268;
  const badgeH = 52;
  drawRoundedRect(
    ctx,
    badgeX,
    badgeY,
    badgeW,
    badgeH,
    metrics.fcrGrade.bgHex,
    metrics.fcrGrade.borderHex,
    3
  );
  const badgeText = `FCR ${batch.finalFcr.toFixed(2)} · ${metrics.fcrGrade.label}`;
  const badgePadX = 14;
  const badgeMaxW = badgeW - badgePadX * 2;
  let badgeFontSize = 20;
  ctx.font = `700 ${badgeFontSize}px ${fontBody}`;
  let badgeTextW = ctx.measureText(badgeText).width;
  while (badgeTextW > badgeMaxW && badgeFontSize > 14) {
    badgeFontSize -= 1;
    ctx.font = `700 ${badgeFontSize}px ${fontBody}`;
    badgeTextW = ctx.measureText(badgeText).width;
  }
  const safeBadgeW = Math.min(
    badgeMaxW,
    Math.max(badgeTextW, badgeText.length * badgeFontSize * 0.42)
  );
  const badgeTextX = Math.max(
    badgeX + badgePadX,
    Math.min(
      badgeX + badgeW - badgePadX - safeBadgeW,
      badgeX + (badgeW - safeBadgeW) / 2
    )
  );
  ctx.fillStyle = metrics.fcrGrade.colorHex;
  ctx.textAlign = 'left';
  ctx.fillText(badgeText, badgeTextX, badgeY + 33, badgeMaxW);

  // Section 1: 6 Core KPI Cards (2 rows x 3 cols)
  ctx.fillStyle = '#3a1f0f';
  ctx.font = `700 22px ${fontDisplay}`;
  ctx.fillText('ตัวชี้วัดหลักประจำรุ่น (Key Performance Summary)', 76, 384);

  const kpiCards = [
    {
      label: 'วันที่เข้า - ออก (ระยะเวลาเลี้ยง)',
      value: `${batch.startDate} → ${batch.closedDate}`,
      sub: `เลี้ยงทั้งหมด ${metrics.daysRaised} วัน`,
      valueColor: '#3a1f0f',
      valueFontSize: 22,
    },
    {
      label: 'อัตราการรอด (%)',
      value: `${batch.survivalRatePct.toFixed(1)}%`,
      sub: `ขายได้ ${batch.soldDucks.toLocaleString()} / แรกเข้า ${batch.initialDucks.toLocaleString()} ตัว`,
      valueColor: '#065f46',
      valueFontSize: 32,
    },
    {
      label: 'น้ำหนักเฉลี่ยต่อตัว',
      value: `${batch.avgWeightPerBirdKg.toFixed(2)} กก./ตัว`,
      sub: `น้ำหนักขายรวม ${batch.totalSoldWeightKg.toLocaleString()} กก.`,
      valueColor: '#3a1f0f',
      valueFontSize: 30,
    },
    {
      label: 'ค่า FCR ปิดรุ่น',
      value: `${batch.finalFcr.toFixed(2)}`,
      sub: `เกณฑ์: ${metrics.fcrGrade.label} · อาหารรวม ${batch.totalFeedUsedKg.toLocaleString()} กก.`,
      valueColor: metrics.fcrGrade.colorHex,
      valueFontSize: 32,
    },
    {
      label: 'ต้นทุนต่อ กก. (Cost / Kg)',
      value: `฿${metrics.costPerKg.toFixed(2)} / กก.`,
      sub: `ต้นทุนรวม ฿${batch.totalCostThb.toLocaleString()} (฿${metrics.costPerBird.toFixed(2)}/ตัว)`,
      valueColor: '#7c2d12',
      valueFontSize: 30,
    },
    {
      label: 'กำไรสุทธิ (Net Profit)',
      value: `฿${batch.netProfitThb.toLocaleString()}`,
      sub: `รายได้รวม ฿${batch.totalRevenueThb.toLocaleString()} (฿${metrics.profitPerBird.toFixed(2)}/ตัว)`,
      valueColor: batch.netProfitThb >= 0 ? '#065f46' : '#9f1239',
      valueFontSize: 32,
    },
  ];

  const cardGap = 20;
  const cardW = (W - 152 - cardGap * 2) / 3;
  const cardH = 148;
  kpiCards.forEach((card, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const cx = 76 + col * (cardW + cardGap);
    const cy = 404 + row * (cardH + 18);
    const innerCardMaxW = cardW - 36;
    drawRoundedRect(ctx, cx, cy, cardW, cardH, '#fbf0d4', '#723b18', 2.5);
    ctx.fillStyle = '#723b18';
    ctx.font = `600 17px ${fontBody}`;
    ctx.fillText(card.label, cx + 18, cy + 34, innerCardMaxW);

    ctx.fillStyle = card.valueColor;
    ctx.font = `700 ${card.valueFontSize}px ${fontBody}`;
    ctx.fillText(card.value, cx + 18, cy + 84, innerCardMaxW);

    ctx.fillStyle = '#5c2e14';
    ctx.font = `500 16px ${fontBody}`;
    ctx.fillText(card.sub, cx + 18, cy + 124, innerCardMaxW);
  });

  // Section 2: 2 Detailed Tables side by side
  const tableTop = 758;
  const halfW = (W - 152 - 24) / 2;

  const drawDetailTable = (
    x: number,
    y: number,
    width: number,
    title: string,
    rows: Array<{ label: string; value: string; highlight?: boolean }>
  ) => {
    drawRoundedRect(ctx, x, y, width, 46, '#ebd2a2', '#723b18', 2.5);
    ctx.fillStyle = '#3a1f0f';
    ctx.font = `700 20px ${fontDisplay}`;
    ctx.fillText(title, x + 16, y + 30, width - 32);

    const rowH = 54;
    const padX = 16;
    const rightEdge = x + width - padX;
    const innerWidth = width - padX * 2;

    rows.forEach((r, idx) => {
      const ry = y + 46 + idx * rowH;
      drawRoundedRect(
        ctx,
        x,
        ry,
        width,
        rowH,
        r.highlight ? '#fef3c7' : idx % 2 === 0 ? '#ffffff' : '#fff9eb',
        '#d6b680',
        1.5
      );

      // Measure value first using single unified Thai+Latin font so width is exact
      let valFontSize = 18;
      ctx.font = `700 ${valFontSize}px ${fontBody}`;
      let valWidth = ctx.measureText(r.value).width;
      const maxValWidth = innerWidth * 0.56;
      while (valWidth > maxValWidth && valFontSize > 14) {
        valFontSize -= 1;
        ctx.font = `700 ${valFontSize}px ${fontBody}`;
        valWidth = ctx.measureText(r.value).width;
      }
      const renderedValWidth = Math.min(valWidth, maxValWidth);
      const valX = rightEdge - renderedValWidth;
      const maxLabelWidth = Math.max(120, valX - (x + padX) - 12);

      ctx.textAlign = 'left';
      ctx.fillStyle = r.highlight ? '#3a1f0f' : '#5c2e14';
      ctx.font = `${r.highlight ? '700' : '500'} 17px ${fontBody}`;
      ctx.fillText(r.label, x + padX, ry + 34, maxLabelWidth);

      ctx.fillStyle = r.highlight ? '#065f46' : '#3a1f0f';
      ctx.font = `700 ${valFontSize}px ${fontBody}`;
      ctx.fillText(r.value, valX, ry + 34, maxValWidth);
    });
  };

  drawDetailTable(76, tableTop, halfW, 'รายละเอียดฝูงและประสิทธิภาพการเลี้ยง', [
    { label: 'วันที่รับเป็ดเข้า → วันที่ปิดรุ่น', value: `${batch.startDate} → ${batch.closedDate}` },
    { label: 'จำนวนวันเลี้ยงทั้งหมด', value: `${metrics.daysRaised} วัน` },
    { label: 'จำนวนเป็ดแรกเข้า', value: `${batch.initialDucks.toLocaleString()} ตัว` },
    { label: 'จำนวนเป็ดที่จับขายได้', value: `${batch.soldDucks.toLocaleString()} ตัว` },
    { label: 'คัดทิ้ง / ตายสะสมตลอดรุ่น', value: `${metrics.lostDucks.toLocaleString()} ตัว` },
    { label: 'อัตราการรอดตาย (Survival Rate)', value: `${batch.survivalRatePct.toFixed(1)}%`, highlight: true },
    { label: 'น้ำหนักขายมีชีวิตรวม', value: `${batch.totalSoldWeightKg.toLocaleString()} กก.` },
    { label: 'น้ำหนักเฉลี่ยต่อตัว / อาหารรวม', value: `${batch.avgWeightPerBirdKg.toFixed(2)} กก. / ${batch.totalFeedUsedKg.toLocaleString()} กก.` },
    { label: 'ค่า FCR ปิดรุ่น / FE (%)', value: `${batch.finalFcr.toFixed(2)} (${metrics.feedEfficiencyPct.toFixed(1)}%)`, highlight: true },
  ]);

  drawDetailTable(76 + halfW + 24, tableTop, halfW, 'สรุปต้นทุนและผลตอบแทนทางการเงิน', [
    { label: 'รายได้จากการขายรวม', value: `฿${batch.totalRevenueThb.toLocaleString()}` },
    { label: 'ราคาขายเฉลี่ยต่อ กก.', value: `฿${metrics.revenuePerKg.toFixed(2)} / กก.` },
    { label: 'ต้นทุนการผลิตรวมทั้งหมด', value: `฿${batch.totalCostThb.toLocaleString()}` },
    { label: 'ต้นทุนต่อ กก. (Cost / Kg)', value: `฿${metrics.costPerKg.toFixed(2)} / กก.`, highlight: true },
    { label: 'ต้นทุนเฉลี่ยต่อตัว', value: `฿${metrics.costPerBird.toFixed(2)} / ตัว` },
    { label: 'กำไรสุทธิต่อ กก.', value: `฿${metrics.profitPerKg.toFixed(2)} / กก.` },
    { label: 'กำไรสุทธิต่อตัว', value: `฿${metrics.profitPerBird.toFixed(2)} / ตัว` },
    {
      label: 'คุณภาพซาก (เกรด A / เกรด B)',
      value: matchedSale
        ? `A ${matchedSale.carcassGradeAPct}% / B ${matchedSale.carcassGradeBPct}%`
        : 'ตามเกณฑ์มาตรฐานฟาร์ม',
    },
    { label: 'กำไรสุทธิรวมประจำรุ่น', value: `฿${batch.netProfitThb.toLocaleString()}`, highlight: true },
  ]);

  // Section 3: Notes / Carcass Feedback Box
  const notesY = 1320;
  drawRoundedRect(ctx, 76, notesY, W - 152, 165, '#fbf0d4', '#8e4c1d', 2.5);
  ctx.fillStyle = '#3a1f0f';
  ctx.font = `700 20px ${fontDisplay}`;
  ctx.fillText('สรุปคุณภาพซาก & ข้อสังเกตสำหรับรุ่นถัดไป', 98, notesY + 36);

  ctx.fillStyle = '#4a2612';
  ctx.font = `500 18px ${fontBody}`;
  const feedbackLine = matchedSale?.buyerFeedback
    ? `คุณภาพซาก/ผู้รับซื้อ: ${matchedSale.buyerFeedback}`
    : `สถานะปิดรุ่น: ปิดรุ่นเรียบร้อยและเข้าสู่ขั้นตอนพักเล้า-ทำความสะอาดแล้ว`;
  const issueLine = matchedSale?.issuesEncountered
    ? `ข้อสังเกต/ปัญหาที่พบ: ${matchedSale.issuesEncountered}`
    : `ประเมินผล FCR: ${batch.finalFcr.toFixed(2)} (${metrics.fcrGrade.label}) · อัตรารอด ${batch.survivalRatePct.toFixed(1)}%`;

  drawTruncatedText(ctx, feedbackLine, 98, notesY + 74, W - 196, 28, 2);
  drawTruncatedText(ctx, issueLine, 98, notesY + 124, W - 196, 28, 2);

  // Footer Signature Lines
  const sigY = 1585;
  ctx.strokeStyle = '#8e4c1d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, sigY);
  ctx.lineTo(440, sigY);
  ctx.moveTo(W - 440, sigY);
  ctx.lineTo(W - 120, sigY);
  ctx.stroke();

  const drawCenteredLabel = (
    text: string,
    centerX: number,
    y: number,
    maxW: number,
    fontSpec: string
  ) => {
    ctx.textAlign = 'left';
    ctx.font = fontSpec;
    const measured = Math.min(maxW, ctx.measureText(text).width);
    const startX = Math.max(60, centerX - measured / 2);
    ctx.fillText(text, startX, y, maxW);
  };

  ctx.fillStyle = '#5c2e14';
  drawCenteredLabel(`ผู้บันทึกข้อมูล (${farm.farmerName})`, 280, sigY + 32, 320, `600 18px ${fontBody}`);
  drawCenteredLabel('ผู้ตรวจสอบ / เจ้าของฟาร์ม', W - 280, sigY + 32, 320, `600 18px ${fontBody}`);

  ctx.fillStyle = '#723b18';
  drawCenteredLabel(
    `Duck Valley Farm Management System · ${batch.batchName} · ${batch.barnName}`,
    W / 2,
    1682,
    W - 140,
    `500 15px ${fontBody}`
  );

  const imgData = canvas.toDataURL('image/png');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  doc.addImage(imgData, 'PNG', 0, 0, 210, 297);
  const safeName = batch.batchName.replace(/[^\w\u0E00-\u0E7F-]+/g, '_');
  doc.save(`สรุปผลงานประจำรุ่น-${safeName}.pdf`);
}
