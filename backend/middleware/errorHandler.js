/**
 * Express error middleware — never leak internal err.message in production.
 */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isProd() {
  return process.env.NODE_ENV === 'production';
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let message = 'Internal server error';

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
  } else if (err?.name === 'CastError' || err?.kind === 'ObjectId') {
    status = 400;
    message = 'Invalid id';
  } else if (err?.name === 'ValidationError') {
    status = 400;
    message = isProd() ? 'Validation failed' : (err.message || message);
  } else if (typeof err?.message === 'string' && /must be YYYY-MM-DD|Invalid|required|not found/i.test(err.message)) {
    // Route-thrown validation Errors without HttpError
    status = status >= 400 && status < 600 ? status : 400;
    message = err.message;
  } else if (!isProd() && err?.message) {
    message = err.message;
  }

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
}
