// ============================================================================
// Transporter Factory & Registry
// Resolves transporter adapters dynamically and executes live tracking queries.
// ============================================================================
import { VRLAdapter } from './VRLAdapter.js';
import { BaseTransporterAdapter } from './BaseAdapter.js';

class GenericAdapter extends BaseTransporterAdapter {
  async trackShipment(lrNumber, existingRecord = {}) {
    return {
      lrNumber,
      transporterCode: this.code,
      transporterName: this.name,
      trackingUrl: this.getTrackingUrl(lrNumber),
      currentStatus: existingRecord.current_status || 'in_transit',
      currentLocation: existingRecord.current_location || '',
      expectedDeliveryDate: existingRecord.expected_delivery_date || null,
      events: [],
      syncStatus: 'verified_link',
      syncError: null,
      source: 'adapter',
    };
  }
}

export function getTransporterAdapter(transporterCode = 'other', config = {}) {
  const code = String(transporterCode || 'other').toLowerCase().trim();
  switch (code) {
    case 'vrl':
      return new VRLAdapter(config);
    case 'tci':
      return new GenericAdapter({
        code: 'tci',
        name: 'TCI Express',
        tracking_url_template: 'https://www.tciexpress.in/tracking.aspx?docket={lr_number}',
        ...config,
      });
    case 'safexpress':
      return new GenericAdapter({
        code: 'safexpress',
        name: 'Safexpress',
        tracking_url_template: 'https://www.safexpress.com/track?waybill={lr_number}',
        ...config,
      });
    case 'delhivery':
      return new GenericAdapter({
        code: 'delhivery',
        name: 'Delhivery Surface',
        tracking_url_template: 'https://www.delhivery.com/track/package/{lr_number}',
        ...config,
      });
    case 'rivigo':
      return new GenericAdapter({
        code: 'rivigo',
        name: 'Rivigo Prime',
        tracking_url_template: 'https://www.rivigo.com/track/{lr_number}',
        ...config,
      });
    default:
      return new GenericAdapter({
        code: 'other',
        name: config.name || 'Other Transporter',
        tracking_url_template: config.tracking_url_template || '',
        ...config,
      });
  }
}
