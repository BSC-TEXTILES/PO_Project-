// Unit tests for the MySQL data-access layer (no live database needed).
//   node --test tests/db.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// db.js validates configuration at import; the pool itself connects lazily.
process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_USER ||= 'unit_test';
process.env.DB_NAME ||= 'unit_test';
const { bindParams, resolveDbConfig, businessDate, pool } = await import('../src/config/db.js');

test('numbered placeholders become ? in order, reusing values', () => {
  const r = bindParams('SELECT * FROM t WHERE a = $1 AND (b = $2 OR c = $1)', ['x', 5]);
  assert.equal(r.sql, 'SELECT * FROM t WHERE a = ? AND (b = ? OR c = ?)');
  assert.deepEqual(r.values, ['x', 5, 'x']);
});

test('placeholders inside string literals, identifiers and comments are left alone', () => {
  const r = bindParams("SELECT '$1', `$2`, \"$3\" -- $4\n FROM t WHERE x = $1", ['v']);
  assert.equal(r.sql, "SELECT '$1', `$2`, \"$3\" -- $4\n FROM t WHERE x = ?");
  assert.deepEqual(r.values, ['v']);
});

test('escaped quotes inside literals do not end the literal', () => {
  const r = bindParams("SELECT 'it''s $1', 'a\\'b $2' FROM t WHERE x = $1", ['v']);
  assert.ok(r.sql.endsWith('WHERE x = ?'));
  assert.deepEqual(r.values, ['v']);
});

test('a missing bound value is an error, never silently NULL', () => {
  assert.throws(() => bindParams('SELECT $2', ['only-one']), /no bound value/);
});

test('LIMIT / OFFSET values are coerced to integers and validated', () => {
  const r = bindParams('SELECT 1 LIMIT $1 OFFSET $2', ['10', '20']);
  assert.deepEqual(r.values, [10, 20]);
  assert.throws(() => bindParams('SELECT 1 LIMIT $1', ['10; DROP TABLE users']), /non-negative integer/);
  assert.throws(() => bindParams('SELECT 1 LIMIT $1', [-1]), /non-negative integer/);
});

test('arrays expand for IN (...); empty arrays bind as NULL (match nothing)', () => {
  assert.deepEqual(bindParams('x IN ($1)', [['a', 'b']]).values, [['a', 'b']]);
  assert.deepEqual(bindParams('x IN ($1)', [[]]).values, [[null]]);
});

test('plain objects are JSON-encoded; undefined becomes NULL', () => {
  const r = bindParams('INSERT INTO t (j, k) VALUES ($1, $2)', [{ a: 1 }, undefined]);
  assert.deepEqual(r.values, ['{"a":1}', null]);
});

test('ISO-8601 timestamps with an offset become Date objects (stored as UTC)', () => {
  const [v] = bindParams('SELECT $1', ['2026-11-24T10:00:00.000+05:30']).values;
  assert.ok(v instanceof Date);
  assert.equal(v.toISOString(), '2026-11-24T04:30:00.000Z');
  // plain dates and ordinary strings are untouched
  assert.deepEqual(bindParams('SELECT $1, $2', ['2026-11-24', 'hello']).values, ['2026-11-24', 'hello']);
});

test('config: DB_* variables, DATABASE_URL fallback, non-MySQL URLs rejected', () => {
  const c = resolveDbConfig({ DB_HOST: 'h', DB_PORT: '3307', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'bsc_textiles', DB_CONNECTION_LIMIT: '7' });
  assert.deepEqual([c.host, c.port, c.user, c.password, c.database, c.connectionLimit], ['h', 3307, 'u', 'p', 'bsc_textiles', 7]);
  const u = resolveDbConfig({ DATABASE_URL: 'mysql://app:s%40cret@db:3306/poms' });
  assert.equal(u.password, 's@cret');
  assert.throws(() => resolveDbConfig({ DATABASE_URL: 'postgresql://x@y/z' }), /mysql:\/\//);
  assert.throws(() => resolveDbConfig({ DATABASE_URL: 'mongodb://x@y/z' }), /MySQL only/);
  assert.throws(() => resolveDbConfig({}), /not configured/);
  assert.throws(() => resolveDbConfig({ DB_USER: 'u', DB_NAME: 'bad-name;' }), /DB_NAME/);
});

test('businessDate uses the business time zone (+05:30), not UTC', () => {
  // 20:00 UTC on the 24th is already the 25th in India
  assert.equal(businessDate(new Date('2026-11-24T20:00:00Z')), '2026-11-25');
  assert.equal(businessDate(new Date('2026-11-24T10:00:00Z')), '2026-11-24');
});

test.after(() => pool.end());
