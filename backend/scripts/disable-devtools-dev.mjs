// Dev helper: turn off DevTools blocking in the local database (settings.security).
import { query, pool } from '../src/config/db.js';

await query(
  `INSERT INTO settings (\`key\`, value, description)
   VALUES ('security', '{"devtoolsBlock": false}', 'DevTools blocking — disabled in development')
   ON DUPLICATE KEY UPDATE value = JSON_SET(value, '$.devtoolsBlock', false)`);
console.log('✓ Successfully set devtoolsBlock: false in settings');
await pool.end();
