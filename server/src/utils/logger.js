function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return JSON.stringify({ message: 'Unable to serialize log payload' });
  }
}

function write(level, message, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = safeJson(payload);
  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

module.exports = {
  info(message, meta) {
    write('info', message, meta);
  },
  warn(message, meta) {
    write('warn', message, meta);
  },
  error(message, meta) {
    write('error', message, meta);
  },
};
