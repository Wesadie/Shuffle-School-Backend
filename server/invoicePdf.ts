import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Invoice } from "@shared/schema";
import { invoiceDescription } from "@shared/invoices";
import { licensePlanLabel, isLicensePlanType } from "@shared/licence-pricing";

/**
 * Professional PDF invoice renderer.
 *
 * The invoice row is the single source of truth: the PDF is regenerated
 * deterministically from the stored snapshot fields (billing details, prices,
 * licence period), so re-downloading an old invoice always looks identical
 * even after the customer edits their billing details.
 *
 * Branding follows the app's design tokens: primary colour hsl(184 99% 28%)
 * and the ShuffleSchool logo.
 */

const PRIMARY = rgb(0x01 / 255, 0x85 / 255, 0x8e / 255); // --primary: 184 99% 28%
const DARK = rgb(0x17 / 255, 0x24 / 255, 0x2d / 255);
const GREY = rgb(0x5f / 255, 0x6b / 255, 0x76 / 255);
const LIGHT_GREY = rgb(0x8a / 255, 0x95 / 255, 0x9e / 255);
const EMERALD = rgb(0x05 / 255, 0x96 / 255, 0x69 / 255);
const ROW_BG = rgb(0xf0 / 255, 0xf7 / 255, 0xf8 / 255);
const BORDER = rgb(0xd9 / 255, 0xe2 / 255, 0xe4 / 255);

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;

/** Standard PDF fonts are WinAnsi-encoded: fold common unicode to ASCII and
 * drop anything the font cannot encode. */
function wa(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a timestamp as a South African date (SAST, UTC+2). */
function formatDate(value: Date | null): string {
  if (!value) return "-";
  const sast = new Date(value.getTime() + 2 * 60 * 60 * 1000);
  return `${sast.getUTCDate()} ${MONTHS[sast.getUTCMonth()]} ${sast.getUTCFullYear()}`;
}

/** Format cents as ZAR, e.g. "R 12 000.00". */
function formatCents(cents: number): string {
  const rands = Math.floor(Math.abs(cents) / 100);
  const remainder = String(Math.abs(cents) % 100).padStart(2, "0");
  const grouped = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${cents < 0 ? "-" : ""}R ${grouped}.${remainder}`;
}

let cachedLogo: Uint8Array | null | undefined;

/** Load the ShuffleSchool logo once; returns null when unavailable so the
 * invoice still renders with the text wordmark. */
async function loadLogo(): Promise<Uint8Array | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  const candidates = [
    path.resolve(import.meta.dirname, "..", "attached_assets", "shuffle-school-icon.png"),
    path.resolve(process.cwd(), "attached_assets", "shuffle-school-icon.png"),
  ];
  for (const candidate of candidates) {
    try {
      cachedLogo = new Uint8Array(await readFile(candidate));
      return cachedLogo;
    } catch {
      // Try the next location.
    }
  }
  cachedLogo = null;
  return cachedLogo;
}

interface TextOptions {
  size?: number;
  font: PDFFont;
  color?: ReturnType<typeof rgb>;
}

function drawLeft(page: PDFPage, text: string, x: number, y: number, options: TextOptions) {
  page.drawText(wa(text), { x, y, size: options.size ?? 10, font: options.font, color: options.color ?? DARK });
}

function drawRight(page: PDFPage, text: string, rightEdge: number, y: number, options: TextOptions) {
  const safe = wa(text);
  const width = options.font.widthOfTextAtSize(safe, options.size ?? 10);
  page.drawText(safe, {
    x: rightEdge - width,
    y,
    size: options.size ?? 10,
    font: options.font,
    color: options.color ?? DARK,
  });
}

export async function generateInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ShuffleSchool invoice ${invoice.invoiceNumber}`);
  pdf.setCreator("ShuffleSchool");

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const top = (offset: number) => PAGE_HEIGHT - offset;

  // ---- Header ----
  const logo = await loadLogo();
  if (logo) {
    const png = await pdf.embedPng(logo);
    page.drawImage(png, { x: MARGIN, y: top(48) - 34, width: 34, height: 34 });
  }
  drawLeft(page, "ShuffleSchool", logo ? MARGIN + 44 : MARGIN, top(48) - 22, { font: bold, size: 19 });
  drawLeft(page, "K-12 class placement tool", logo ? MARGIN + 44 : MARGIN, top(48) - 35, {
    font: regular,
    size: 8.5,
    color: GREY,
  });
  drawLeft(page, "shuffleschool.co.za", logo ? MARGIN + 44 : MARGIN, top(48) - 46, {
    font: regular,
    size: 8.5,
    color: GREY,
  });

  drawRight(page, "TAX INVOICE", CONTENT_RIGHT, top(48) - 22, { font: bold, size: 20, color: PRIMARY });

  // PAID badge
  const badgeWidth = 58;
  const badgeX = CONTENT_RIGHT - badgeWidth;
  const badgeY = top(48) - 44;
  page.drawRectangle({ x: badgeX, y: badgeY, width: badgeWidth, height: 18, color: EMERALD });
  const paidText = wa(invoice.status === "paid" ? "PAID" : invoice.status.toUpperCase());
  drawRight(
    page,
    paidText,
    CONTENT_RIGHT - (badgeWidth - bold.widthOfTextAtSize(paidText, 9)) / 2,
    badgeY + 5.5,
    { font: bold, size: 9, color: rgb(1, 1, 1) },
  );

  page.drawLine({
    start: { x: MARGIN, y: top(48) - 58 },
    end: { x: CONTENT_RIGHT, y: top(48) - 58 },
    thickness: 1.5,
    color: PRIMARY,
  });

  // ---- Invoice meta ----
  let metaY = top(48) - 82;
  const metaRows: [string, string][] = [
    ["Invoice number", invoice.invoiceNumber],
    ["Invoice date", formatDate(invoice.invoiceDate)],
    ["PayFast reference", invoice.payfastPaymentId],
  ];
  for (const [label, value] of metaRows) {
    drawLeft(page, label.toUpperCase(), MARGIN, metaY, { font: regular, size: 7.5, color: LIGHT_GREY });
    drawLeft(page, value, MARGIN, metaY - 12, { font: bold, size: 10 });
    metaY -= 34;
  }

  // ---- Bill to (snapshot of the customer's billing details) ----
  const billToTop = metaY - 10;
  drawLeft(page, "BILL TO", MARGIN, billToTop, { font: bold, size: 9, color: PRIMARY });

  const snapshot = invoice.billingSnapshot;
  const billToLines: { text: string; bold?: boolean; grey?: boolean }[] = [];
  if (snapshot) {
    if (snapshot.billingName) billToLines.push({ text: snapshot.billingName, bold: true });
    if (snapshot.organisationName) billToLines.push({ text: snapshot.organisationName, bold: true });
    if (snapshot.addressLine1) billToLines.push({ text: snapshot.addressLine1 });
    if (snapshot.addressLine2) billToLines.push({ text: snapshot.addressLine2 });
    const cityLine = [snapshot.city, snapshot.province, snapshot.postalCode].filter(Boolean).join(", ");
    if (cityLine) billToLines.push({ text: cityLine });
    if (snapshot.country) billToLines.push({ text: snapshot.country });
    if (snapshot.billingEmail) billToLines.push({ text: snapshot.billingEmail, grey: true });
    if (snapshot.phone) billToLines.push({ text: snapshot.phone, grey: true });
  }
  if (billToLines.length === 0) {
    billToLines.push({ text: "Billing details not on file at time of purchase", grey: true });
  }

  let billY = billToTop - 18;
  for (const line of billToLines) {
    drawLeft(page, line.text, MARGIN, billY, {
      font: line.bold ? bold : regular,
      size: 10,
      color: line.grey ? GREY : DARK,
    });
    billY -= 14;
  }

  // ---- Line items ----
  const planLabel = isLicensePlanType(invoice.planType) ? licensePlanLabel(invoice.planType) : invoice.planType;
  const tableTop = Math.min(billY - 26, top(48) - 320);
  const headerHeight = 24;
  const rowHeight = 40;

  page.drawRectangle({ x: MARGIN, y: tableTop - headerHeight, width: CONTENT_RIGHT - MARGIN, height: headerHeight, color: PRIMARY });
  drawLeft(page, "DESCRIPTION", MARGIN + 10, tableTop - headerHeight + 8, { font: bold, size: 8.5, color: rgb(1, 1, 1) });
  drawRight(page, "LEARNERS", 372, tableTop - headerHeight + 8, { font: bold, size: 8.5, color: rgb(1, 1, 1) });
  drawRight(page, "PRICE / LEARNER", 468, tableTop - headerHeight + 8, { font: bold, size: 8.5, color: rgb(1, 1, 1) });
  drawRight(page, "AMOUNT", CONTENT_RIGHT - 10, tableTop - headerHeight + 8, { font: bold, size: 8.5, color: rgb(1, 1, 1) });

  const rowTop = tableTop - headerHeight;
  page.drawRectangle({
    x: MARGIN,
    y: rowTop - rowHeight,
    width: CONTENT_RIGHT - MARGIN,
    height: rowHeight,
    color: ROW_BG,
    borderColor: BORDER,
    borderWidth: 0.75,
  });

  const description = invoiceDescription(invoice.transactionType, planLabel, invoice.learnerQuantity);
  drawLeft(page, description, MARGIN + 10, rowTop - 16, { font: bold, size: 10 });
  const licencePeriod = `Licence period: ${formatDate(invoice.licencePeriodStart)} - ${formatDate(invoice.licencePeriodEnd)}`;
  drawLeft(page, licencePeriod, MARGIN + 10, rowTop - 30, { font: regular, size: 8.5, color: GREY });

  drawRight(page, String(invoice.learnerQuantity), 372, rowTop - 24, { font: regular, size: 10 });
  drawRight(page, formatCents(invoice.pricePerLearnerCents), 468, rowTop - 24, { font: regular, size: 10 });
  drawRight(page, formatCents(invoice.subtotalCents), CONTENT_RIGHT - 10, rowTop - 24, { font: bold, size: 10 });

  // ---- Totals ----
  let totalsY = rowTop - rowHeight - 26;
  drawRight(page, "Subtotal", CONTENT_RIGHT - 110, totalsY, { font: regular, size: 10, color: GREY });
  drawRight(page, formatCents(invoice.subtotalCents), CONTENT_RIGHT, totalsY, { font: regular, size: 10 });
  totalsY -= 18;
  drawRight(page, "VAT (Not applicable)", CONTENT_RIGHT - 110, totalsY, { font: regular, size: 10, color: GREY });
  drawRight(page, formatCents(invoice.vatCents), CONTENT_RIGHT, totalsY, { font: regular, size: 10 });
  totalsY -= 24;
  page.drawLine({
    start: { x: CONTENT_RIGHT - 190, y: totalsY + 10 },
    end: { x: CONTENT_RIGHT, y: totalsY + 10 },
    thickness: 0.75,
    color: BORDER,
  });
  drawRight(page, "Total paid", CONTENT_RIGHT - 110, totalsY, { font: bold, size: 12 });
  drawRight(page, formatCents(invoice.totalCents), CONTENT_RIGHT, totalsY, { font: bold, size: 12, color: PRIMARY });
  totalsY -= 16;
  drawRight(page, "Paid in full via PayFast", CONTENT_RIGHT, totalsY, { font: regular, size: 8.5, color: EMERALD });

  // ---- Footer ----
  page.drawLine({
    start: { x: MARGIN, y: 72 },
    end: { x: CONTENT_RIGHT, y: 72 },
    thickness: 0.75,
    color: BORDER,
  });
  drawLeft(page, "ShuffleSchool · shuffleschool.co.za · notifications@shuffleschool.co.za", MARGIN, 58, {
    font: regular,
    size: 8.5,
    color: LIGHT_GREY,
  });
  drawLeft(page, "Thank you for creating balanced classrooms with ShuffleSchool.", MARGIN, 45, {
    font: regular,
    size: 8.5,
    color: LIGHT_GREY,
  });

  return pdf.save();
}
