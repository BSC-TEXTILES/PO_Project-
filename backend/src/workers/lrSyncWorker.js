// ============================================================================
// LR Tracking Background Synchronization Worker
// Periodically polls active in-transit shipments, updates milestones, and logs sync health.
// ============================================================================
import { query, withTransaction, newId } from '../config/db.js';
import { getTransporterAdapter } from '../utils/transporters/index.js';

let syncTimer = null;
let isSyncing = false;

export async function syncActiveShipments() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    // Find active shipments needing update
    const { rows: active } = await query(`
      SELECT t.id, t.lr_number, t.transporter_code, t.current_status, t.current_location,
             t.expected_delivery_date, ti.tracking_url_template, ti.api_endpoint, ti.api_key
      FROM lr_tracking t
      LEFT JOIN transporter_integrations ti ON ti.code = t.transporter_code
      WHERE t.current_status IN ('booked', 'dispatched', 'in_transit', 'at_hub', 'out_for_delivery')
        AND (t.last_sync_at IS NULL OR t.last_sync_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
      LIMIT 10
    `);

    if (active.length === 0) {
      isSyncing = false;
      return;
    }

    console.log(`[LRSyncWorker] Syncing ${active.length} active shipments...`);

    for (const ship of active) {
      const adapter = getTransporterAdapter(ship.transporter_code, {
        tracking_url_template: ship.tracking_url_template,
        api_endpoint: ship.api_endpoint,
        api_key: ship.api_key,
      });

      const startTime = Date.now();
      let res;
      let status = 'success';
      let errMessage = null;

      try {
        res = await adapter.trackShipment(ship.lr_number, ship);
      } catch (err) {
        status = 'failed';
        errMessage = err.message;
      }

      const durationMs = Date.now() - startTime;

      try {
        await withTransaction(async (tx) => {
          if (res) {
            await tx.query(`
              UPDATE lr_tracking
              SET current_status = ?,
                  current_location = COALESCE(?, current_location),
                  last_sync_at = NOW(),
                  sync_status = ?,
                  sync_error = ?
              WHERE id = ?
            `, [res.currentStatus || ship.current_status, res.currentLocation || ship.current_location, status, errMessage, ship.id]);

            if (Array.isArray(res.events)) {
              for (const ev of res.events) {
                await tx.query(`
                  INSERT INTO lr_tracking_events (id, lr_tracking_id, event_time, status, location, remarks, source)
                  VALUES (?, ?, ?, ?, ?, ?, 'transporter_api')
                `, [newId(), ship.id, ev.eventTime || new Date(), ev.status, ev.location || '', ev.remarks || '']);
              }
            }
          }

          await tx.query(`
            INSERT INTO shipment_sync_logs (id, lr_tracking_id, transporter_code, sync_type, status, response_payload, error_message, duration_ms)
            VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?)
          `, [newId(), ship.id, ship.transporter_code, status, JSON.stringify(res || {}), errMessage, durationMs]);
        });
      } catch (dbErr) {
        console.error(`[LRSyncWorker] DB update error for ${ship.lr_number}:`, dbErr.message);
      }
    }
  } catch (err) {
    console.error('[LRSyncWorker] Sync error:', err.message);
  } finally {
    isSyncing = false;
  }
}

export function startLrSyncWorker(intervalMinutes = 20) {
  if (syncTimer) return;
  const intervalMs = Math.max(5, intervalMinutes) * 60 * 1000;
  // Delay first run by 1 minute after boot
  setTimeout(() => {
    syncActiveShipments();
    syncTimer = setInterval(syncActiveShipments, intervalMs);
  }, 60 * 1000);
  console.log(`✓ LR Tracking synchronization worker scheduled (every ${intervalMinutes}m)`);
}

export function stopLrSyncWorker() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
