// ============================================================================
// LR Tracking & OCR Unit Test Suite
// Verifies document intelligence, VRL adapter, pattern recognition, and status normalization.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrDocumentText } from '../src/utils/lrOcr.js';
import { getTransporterAdapter } from '../src/utils/transporters/index.js';
import { VRLAdapter } from '../src/utils/transporters/VRLAdapter.js';

test('LR OCR: correctly identifies VRL Logistics and extracts 10-digit LR number without GST/Phone confusion', () => {
  const sampleVrlDoc = `
    VRL LOGISTICS LTD.
    Hubballi Roadways Division
    GSTIN: 29AABCV1234F1Z9
    L.R. NO: 2401928312
    Date: 25/11/2026
    Consignor: Sri Pachaiyappa Silks Ltd, Surat
    Consignee: M/s BSC Exclusive, PB Road, Davanagere - 577002
    Destination: Davanagere
    From: Surat
    Pkgs: 5 Bales
    Weight: 145.50 Kgs
    Goods: Readymade Garments & Silk Sarees
    Vehicle No: KA-25-D-4821
    Invoice No: INV-2026-0892
    E-Way Bill No: 231456789012
    Phone: 9845123456
  `;

  const { extracted, confidence, requiresVerification } = parseLrDocumentText(sampleVrlDoc);

  assert.equal(extracted.transporterCode, 'vrl');
  assert.equal(extracted.transporterName, 'VRL Logistics Ltd');
  assert.equal(extracted.lrNumber, '2401928312');
  assert.notEqual(extracted.lrNumber, '29AABCV1234F1Z9'); // Not GSTIN
  assert.notEqual(extracted.lrNumber, '9845123456'); // Not phone
  assert.equal(extracted.destinationStore, 'DAV');
  assert.equal(extracted.destinationLocation, 'Davanagere');
  assert.equal(extracted.packageCount, 5);
  assert.equal(extracted.totalWeightKg, 145.5);
  assert.equal(extracted.invoiceNumber, 'INV-2026-0892');
  assert.equal(extracted.ewayBillNumber, '231456789012');
  assert.equal(extracted.vehicleNumber, 'KA-25-D-4821');
  assert.equal(requiresVerification, false);
});

test('LR OCR: maps Belagavi store to BEL and Shivamogga store to SHI', () => {
  const docBel = 'Transport: VRL Logistics. LR No: 109283746. Dest: Belagavi College Road Branch. 10 Pkgs.';
  const resBel = parseLrDocumentText(docBel);
  assert.equal(resBel.extracted.destinationStore, 'BEL');
  assert.equal(resBel.extracted.destinationLocation, 'Belagavi');

  const docShi = 'SafeExpress Consignment Waybill: 987654321. Destination: Shivamogga B.H. Road. 3 Cartons.';
  const resShi = parseLrDocumentText(docShi);
  assert.equal(resShi.extracted.transporterCode, 'safexpress');
  assert.equal(resShi.extracted.destinationStore, 'SHI');
  assert.equal(resShi.extracted.destinationLocation, 'Shivamogga');
});

test('VRL Adapter: validates LR number format and generates official live tracking URL', async () => {
  const adapter = new VRLAdapter();
  assert.equal(adapter.isValidLrNumber('2401928312'), true);
  assert.equal(adapter.isValidLrNumber(''), false);

  const url = adapter.getTrackingUrl('2401928312');
  assert.equal(url, 'https://www.vrlgroup.in/track_consignment.aspx?lr=2401928312');

  const res = await adapter.trackShipment('2401928312', { current_status: 'in_transit' });
  assert.equal(res.transporterCode, 'vrl');
  assert.equal(res.trackingUrl, url);
  assert.equal(res.syncStatus, 'verified_link');
});

test('Transporter Registry: dynamically instantiates correct adapters', () => {
  const vrl = getTransporterAdapter('vrl');
  assert.equal(vrl.code, 'vrl');

  const tci = getTransporterAdapter('tci');
  assert.equal(tci.code, 'tci');

  const del = getTransporterAdapter('delhivery');
  assert.equal(del.code, 'delhivery');

  const other = getTransporterAdapter('random_transport', { name: 'Local Transport' });
  assert.equal(other.code, 'other');
  assert.equal(other.name, 'Local Transport');
});
