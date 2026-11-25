import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from '../utils/httpError.js';

export function notFound(req, res) {
  res.status(404).json({ error: { message: 'Resource not found' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  try {
    const logLine = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n` +
      `Error: ${err.message || err.code || err}\n` +
      (err.sql ? `SQL: ${err.sql}\nSQL Message: ${err.sqlMessage}\n` : '') +
      `Stack: ${err.stack}\n---\n`;
    fs.appendFileSync(path.resolve(process.cwd(), 'backend_errors.log'), logLine, 'utf8');
  } catch (_) {}

  // Log the full error for debugging (server-side only)
  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', err);
  } else {
    // In production, log structured error without sensitive data
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: err.message,
      code: err.code,
      status: err.status,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
      // Do NOT log stack traces, passwords, tokens, or secrets
    }));
  }

  // MySQL duplicate key → duplicate master data (SC-3)
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: {
        message: 'A record with this unique identifier already exists',
        code: 'DUPLICATE_VALUE',
      },
    });
  }

  // MySQL FK violation → referenced / in-use record, or reference to a missing record
  if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    return res.status(409).json({
      error: {
        message: 'This record is referenced by other data and cannot be modified',
        code: 'REFERENCE_CONSTRAINT',
      },
    });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({
      error: {
        message: 'A referenced record does not exist',
        code: 'REFERENCE_CONSTRAINT',
      },
    });
  }

  // MySQL check constraint / strict-mode data validation errors
  if ([
    'ER_CHECK_CONSTRAINT_VIOLATED', 'ER_BAD_NULL_ERROR', 'ER_DATA_TOO_LONG',
    'ER_TRUNCATED_WRONG_VALUE', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'WARN_DATA_TRUNCATED',
    'ER_WARN_DATA_OUT_OF_RANGE', 'ER_INVALID_JSON_TEXT', 'ER_INVALID_JSON_TEXT_IN_PARAM',
    'ER_NO_DEFAULT_FOR_FIELD', 'ER_SIGNAL_EXCEPTION',
  ].includes(err.code)) {
    return res.status(400).json({
      error: {
        message: 'The provided value does not meet the required constraints',
        code: 'VALIDATION_ERROR',
      },
    });
  }

  // MySQL connection / availability errors
  if (['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR',
       'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(err.code)) {
    return res.status(503).json({
      error: {
        message: 'Service temporarily unavailable — please try again later',
        code: 'SERVICE_UNAVAILABLE',
      },
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: {
        message: 'Session invalid or expired — please sign in again',
        code: 'INVALID_TOKEN',
      },
    });
  }

  // Application errors with status codes
  const status = err instanceof ApiError ? err.status : (err.status || err.statusCode || 500);

  // For 500 errors, return generic message (never expose internals)
  if (status >= 500) {
    console.error(`[POMS 500 Error] ${req.method} ${req.originalUrl}:`, err);
    return res.status(500).json({
      error: {
        message: err.message || 'An unexpected error occurred — please try again later',
        code: err.code || 'INTERNAL_ERROR',
      },
    });
  }

  // For client errors, return the message but not implementation details
  res.status(status).json({
    error: {
      message: err.message || 'An error occurred',
      code: (err instanceof ApiError || err.status) ? (err.code || 'CLIENT_ERROR') : 'CLIENT_ERROR',
      details: err.details || undefined,
    },
  });
}
