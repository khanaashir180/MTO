class ApiError extends Error {
  constructor(status, message, code = 'API_ERROR', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { ApiError };
