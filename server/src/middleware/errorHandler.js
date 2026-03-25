function errorHandler(err, req, res, _next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File size exceeds 5 MB limit',
      code: 'FILE_TOO_LARGE',
      requestId: req?.requestId || null,
    });
  }
  if (err.status) {
    return res.status(err.status).json({
      message: err.message,
      code: err.code || 'API_ERROR',
      details: err.details || null,
      requestId: req?.requestId || null,
    });
  }
  console.error(err);
  return res.status(500).json({
    message: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
    requestId: req?.requestId || null,
  });
}

module.exports = errorHandler;
