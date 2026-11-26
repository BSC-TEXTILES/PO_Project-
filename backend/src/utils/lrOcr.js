// ============================================================================
// LR OCR & Document Intelligence Engine
// Accurately extracts LR number, transporter, consignor/consignee, origin/destination,
// packages, weight, dates, invoice, e-way bill from scanned documents and images.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let tesseractWorkerPromise = null;

async function getTesseractWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      try {
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        return worker;
      } catch (err) {
        console.warn('[LR-OCR] Tesseract initialization warning:', err.message);
        return null;
      }
    })();
  }
  return tesseractWorkerPromise;
}

export async function extractRawText(filePath, mimeType = '') {
  const ext = path.extname(filePath).toLowerCase();
  const isPdf = mimeType.includes('pdf') || ext === '.pdf';

  if (isPdf) {
    try {
      const buffer = fs.readFileSync(filePath);
      const mod = await import('pdf-parse');
      const pdf = mod.default || mod;
      const data = await pdf(buffer);
      if (data && data.text && data.text.trim().length > 10) {
        return { text: data.text, method: 'pdf_text', pages: data.numpages || 1 };
      }
    } catch (err) {
      console.warn('[LR-OCR] PDF text extraction failed, falling back to OCR:', err.message);
    }
  }

  // Image or image-based PDF OCR
  try {
    const worker = await getTesseractWorker();
    if (worker) {
      const result = await worker.recognize(filePath);
      return {
        text: result?.data?.text || '',
        method: 'tesseract_ocr',
        confidence: result?.data?.confidence || 75,
        pages: 1,
      };
    }
  } catch (err) {
    console.error('[LR-OCR] OCR recognition error:', err.message);
  }

  return { text: '', method: 'none', pages: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Intelligent LR Pattern Matcher & Field Extraction
// ─────────────────────────────────────────────────────────────────────────────
export function parseLrDocumentText(rawText = '') {
  const text = String(rawText);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const normalizedText = text.replace(/[\t ]+/g, ' ');

  const confidence = {};
  const extracted = {
    lrNumber: '',
    transporterName: 'Other Transporter',
    transporterCode: 'other',
    consignorName: '',
    consigneeName: '',
    originLocation: '',
    destinationLocation: '',
    destinationStore: 'BEL',
    bookingDate: '',
    dispatchDate: '',
    invoiceNumber: '',
    ewayBillNumber: '',
    packageCount: 1,
    totalWeightKg: null,
    goodsDescription: '',
    vehicleNumber: '',
    contactPhone: '',
    bookingOffice: '',
    destinationBranch: '',
  };

  // 1. Transporter Detection (VRL Logistics priority)
  if (/vrl\b|vijayanand\s*roadlines|vrl\s*logistics/i.test(normalizedText)) {
    extracted.transporterName = 'VRL Logistics Ltd';
    extracted.transporterCode = 'vrl';
    confidence.transporter = 0.98;
  } else if (/tci\s*express|transport\s*corporation\s*of\s*india/i.test(normalizedText)) {
    extracted.transporterName = 'TCI Express';
    extracted.transporterCode = 'tci';
    confidence.transporter = 0.95;
  } else if (/safexpress|safe\s*express/i.test(normalizedText)) {
    extracted.transporterName = 'Safexpress';
    extracted.transporterCode = 'safexpress';
    confidence.transporter = 0.95;
  } else if (/delhivery/i.test(normalizedText)) {
    extracted.transporterName = 'Delhivery Surface';
    extracted.transporterCode = 'delhivery';
    confidence.transporter = 0.95;
  } else if (/rivigo/i.test(normalizedText)) {
    extracted.transporterName = 'Rivigo Prime';
    extracted.transporterCode = 'rivigo';
    confidence.transporter = 0.95;
  } else {
    confidence.transporter = 0.40;
  }

  // 2. LR / Tracking Number Extraction
  // Must avoid confusing with GSTIN (15 chars), Phone (10-digit mobile), Invoice, PO numbers
  const lrPrefixPatterns = [
    /(?:l\.?r\.?\s*(?:no|number|num)?|consignment\s*(?:no|number|num)?|docket\s*(?:no|number|num)?|waybill\s*(?:no|num)?|w\.?b\.?\s*no)[\s:#.-]*([A-Z0-9]{6,16})\b/i,
    /(?:lrn|c\/n|cn\s*no|gc\s*no)[\s:#.-]*([A-Z0-9]{6,16})\b/i,
  ];

  for (const pat of lrPrefixPatterns) {
    const m = normalizedText.match(pat);
    if (m && m[1]) {
      const candidate = m[1].trim().toUpperCase();
      // Exclude GSTIN pattern (2 digits + 5 letters + 4 digits + 1 letter + 1 char + Z + 1 char)
      if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/i.test(candidate)) {
        extracted.lrNumber = candidate;
        confidence.lrNumber = 0.95;
        break;
      }
    }
  }

  // VRL Specific LR Number pattern: 9 to 10 consecutive digits
  if (!extracted.lrNumber && extracted.transporterCode === 'vrl') {
    const vrlMatches = normalizedText.match(/\b([1-9]\d{8,9})\b/g);
    if (vrlMatches && vrlMatches.length > 0) {
      // Pick the first candidate that isn't a mobile number or pin code
      for (const cand of vrlMatches) {
        if (!/^[6-9]\d{9}$/.test(cand) && cand.length >= 9) {
          extracted.lrNumber = cand;
          confidence.lrNumber = 0.85;
          break;
        }
      }
      if (!extracted.lrNumber) {
        extracted.lrNumber = vrlMatches[0];
        confidence.lrNumber = 0.70;
      }
    }
  }

  // Generic fallback for LR number if still empty
  if (!extracted.lrNumber) {
    const genericMatches = normalizedText.match(/\b([A-Z]{2,4}[-0-9]{6,12})\b/);
    if (genericMatches && !/^PO-|^INV-/i.test(genericMatches[1])) {
      extracted.lrNumber = genericMatches[1];
      confidence.lrNumber = 0.60;
    }
  }

  // 3. E-Way Bill Number (12 digits)
  const ewayMatch = normalizedText.match(/(?:e-?way\s*(?:bill)?\s*(?:no|num)?|ewb\s*(?:no)?)[\s:#.-]*([0-9]{12})\b/i);
  if (ewayMatch) {
    extracted.ewayBillNumber = ewayMatch[1];
    confidence.ewayBillNumber = 0.95;
  } else {
    const standalone12 = normalizedText.match(/\b(2[0-9]{11}|1[0-9]{11})\b/);
    if (standalone12 && standalone12[1] !== extracted.lrNumber) {
      extracted.ewayBillNumber = standalone12[1];
      confidence.ewayBillNumber = 0.75;
    }
  }

  // 4. Invoice Number
  const invMatch = normalizedText.match(/(?:inv(?:oice)?\s*(?:no|num)?|bill\s*no)[\s:#.-]*([A-Z0-9\/-]{3,25})\b/i);
  if (invMatch && !/gst|date/i.test(invMatch[1])) {
    extracted.invoiceNumber = invMatch[1].replace(/[,;]$/, '').trim();
    confidence.invoiceNumber = 0.90;
  }

  // 5. Booking & Dispatch Date
  const datePatterns = [
    /(?:booking|bkg|bkg\s*dt|lr\s*date|date)[\s:#.-]*([0-3]?[0-9][\/\-.][0-1]?[0-9][\/\-.](?:20)?\d{2})/i,
    /(?:dispatch|despatch)[\s:#.-]*([0-3]?[0-9][\/\-.][0-1]?[0-9][\/\-.](?:20)?\d{2})/i,
    /\b([0-3]?[0-9][\/\-.][0-1]?[0-9][\/\-.](?:20)\d{2})\b/,
  ];

  function parseDateStr(str) {
    if (!str) return null;
    const parts = str.split(/[\/\-.]/);
    if (parts.length === 3) {
      let d = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      if (d > 12 && m <= 12) {
        // DD/MM/YYYY
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      } else if (m > 12 && d <= 12) {
        // MM/DD/YYYY
        return `${y}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  const dateMatch1 = normalizedText.match(datePatterns[0]);
  if (dateMatch1 && parseDateStr(dateMatch1[1])) {
    extracted.bookingDate = parseDateStr(dateMatch1[1]);
    confidence.bookingDate = 0.90;
  }
  const dateMatch2 = normalizedText.match(datePatterns[1]);
  if (dateMatch2 && parseDateStr(dateMatch2[1])) {
    extracted.dispatchDate = parseDateStr(dateMatch2[1]);
    confidence.dispatchDate = 0.90;
  } else if (extracted.bookingDate) {
    extracted.dispatchDate = extracted.bookingDate;
    confidence.dispatchDate = 0.75;
  }

  // 6. Origin & Destination Locations + BSC Store Branch Mapping
  const cityMappings = [
    { regex: /belagavi|belgaum|bel\b|blg\b/i, code: 'BEL', name: 'Belagavi' },
    { regex: /davanagere|davangere|dav\b|dvg\b/i, code: 'DAV', name: 'Davanagere' },
    { regex: /shivamogga|shimoga|shi\b|smg\b/i, code: 'SHI', name: 'Shivamogga' },
    { regex: /hubballi|hubli/i, code: 'HBL', name: 'Hubballi' },
    { regex: /bengaluru|bangalore/i, code: 'BLR', name: 'Bengaluru' },
    { regex: /mumbai|bombay/i, code: 'BOM', name: 'Mumbai' },
    { regex: /surat/i, code: 'ST', name: 'Surat' },
    { regex: /ahmedabad/i, code: 'AMD', name: 'Ahmedabad' },
    { regex: /tirupur|tiruppur/i, code: 'TPR', name: 'Tirupur' },
    { regex: /coimbatore/i, code: 'CBE', name: 'Coimbatore' },
    { regex: /delhi|new\s*delhi/i, code: 'DEL', name: 'Delhi' },
  ];

  // Destination detection
  const destMatch = normalizedText.match(/(?:to|dest(?:ination)?|consignee\s*branch)[\s:#.-]*([A-Za-z\s]{3,30})/i);
  if (destMatch) {
    const candidateDest = destMatch[1];
    for (const city of cityMappings) {
      if (city.regex.test(candidateDest)) {
        extracted.destinationLocation = city.name;
        if (['BEL', 'DAV', 'SHI'].includes(city.code)) {
          extracted.destinationStore = city.code;
        }
        confidence.destination = 0.92;
        break;
      }
    }
  }

  if (!extracted.destinationLocation) {
    for (const city of cityMappings) {
      if (city.regex.test(normalizedText)) {
        extracted.destinationLocation = city.name;
        if (['BEL', 'DAV', 'SHI'].includes(city.code)) {
          extracted.destinationStore = city.code;
        }
        confidence.destination = 0.70;
        break;
      }
    }
  }

  // Origin detection
  const fromMatch = normalizedText.match(/(?:from|origin|booking\s*(?:station|branch|office))[\s:#.-]*([A-Za-z\s]{3,30})/i);
  if (fromMatch) {
    const candidateFrom = fromMatch[1];
    for (const city of cityMappings) {
      if (city.regex.test(candidateFrom) && city.name !== extracted.destinationLocation) {
        extracted.originLocation = city.name;
        confidence.origin = 0.90;
        break;
      }
    }
  }
  if (!extracted.originLocation) {
    extracted.originLocation = 'Surat'; // Major textile origin default
    confidence.origin = 0.40;
  }

  // 7. Consignor & Consignee
  const consignorMatch = normalizedText.match(/(?:consignor|shipper|from\s*m\/s)[\s:#.-]*([A-Za-z0-9\s.,&'-]{4,60})/i);
  if (consignorMatch) {
    extracted.consignorName = consignorMatch[1].replace(/[\r\n].*$/, '').trim();
    confidence.consignor = 0.88;
  }

  const consigneeMatch = normalizedText.match(/(?:consignee|to\s*m\/s|receiver)[\s:#.-]*([A-Za-z0-9\s.,&'-]{4,60})/i);
  if (consigneeMatch) {
    extracted.consigneeName = consigneeMatch[1].replace(/[\r\n].*$/, '').trim();
    confidence.consignee = 0.88;
  } else if (/bsc\s*exclusive|bsc\s*textiles/i.test(normalizedText)) {
    extracted.consigneeName = 'M/s BSC Exclusive';
    confidence.consignee = 0.95;
  }

  // 8. Number of Packages
  const pkgMatch = normalizedText.match(/(\d+)\s*(?:pkgs?|packages?|bales?|boxes?|cases?|cartons?|nos?|bundles?)\b/i);
  if (pkgMatch) {
    extracted.packageCount = parseInt(pkgMatch[1], 10) || 1;
    confidence.packages = 0.95;
  } else {
    confidence.packages = 0.50;
  }

  // 9. Weight (kg)
  const wtMatch = normalizedText.match(/(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?|wt|weight|charged\s*wt)\b/i);
  if (wtMatch) {
    extracted.totalWeightKg = parseFloat(wtMatch[1]);
    confidence.weight = 0.90;
  }

  // 10. Vehicle Number (Indian registration: e.g. KA-25-D-4821)
  const vehMatch = normalizedText.match(/\b([A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,3}[ -]?[0-9]{4})\b/i);
  if (vehMatch) {
    extracted.vehicleNumber = vehMatch[1].toUpperCase().replace(/\s+/g, '-');
    confidence.vehicleNumber = 0.92;
  }

  // 11. Goods Description
  const goodsKeywords = [
    'Textiles', 'Readymade Garments', 'Cotton Shirts', 'Silk Sarees',
    'Mens Apparel', 'Kids Wear', 'Home Furnishings', 'Cloth Bales',
  ];
  for (const kw of goodsKeywords) {
    if (new RegExp(kw, 'i').test(normalizedText)) {
      extracted.goodsDescription = kw;
      confidence.goodsDescription = 0.85;
      break;
    }
  }
  if (!extracted.goodsDescription) {
    extracted.goodsDescription = 'Readymade Garments & Textiles';
    confidence.goodsDescription = 0.50;
  }

  // Overall confidence & requires verification flag
  const requiredFields = ['lrNumber', 'transporter', 'destination'];
  const avgConfidence = Object.values(confidence).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(confidence).length);
  const requiresVerification = requiredFields.some((f) => (confidence[f] || 0) < 0.70) || !extracted.lrNumber;

  return {
    extracted,
    confidence,
    avgConfidence: Math.round(avgConfidence * 100),
    requiresVerification,
    rawTextPreview: lines.slice(0, 15).join('\n'),
  };
}
