// ============================================================================
// Base Transporter Adapter
// Provides standardized interface for tracking shipments across transporters.
// ============================================================================

export class BaseTransporterAdapter {
  constructor(config = {}) {
    this.code = config.code || 'other';
    this.name = config.name || 'General Transporter';
    this.apiEndpoint = config.api_endpoint || null;
    this.apiKey = config.api_key || null;
    this.trackingUrlTemplate = config.tracking_url_template || '';
  }

  getTrackingUrl(lrNumber) {
    if (this.trackingUrlTemplate && lrNumber) {
      return this.trackingUrlTemplate.replace('{lr_number}', encodeURIComponent(lrNumber));
    }
    return '';
  }

  async trackShipment(lrNumber, existingRecord = {}) {
    throw new Error(`trackShipment() must be implemented by adapter for ${this.code}`);
  }

  normalizeStatus(transporterStatus = '') {
    const s = String(transporterStatus).toLowerCase().trim();
    if (s.includes('deliver') || s.includes('received by party')) return 'delivered';
    if (s.includes('out for delivery') || s.includes('ofd')) return 'out_for_delivery';
    if (s.includes('hub') || s.includes('transshipment') || s.includes('arrived at')) return 'at_hub';
    if (s.includes('transit') || s.includes('dispatched') || s.includes('loaded')) return 'in_transit';
    if (s.includes('booked') || s.includes('accepted')) return 'booked';
    if (s.includes('delay') || s.includes('hold')) return 'delayed';
    if (s.includes('exception') || s.includes('rto') || s.includes('undelivered')) return 'exception';
    if (s.includes('cancel')) return 'cancelled';
    return 'in_transit';
  }
}
