const http = require('http');
const { Server } = require('socket.io');

const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: env.clientOrigin,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  logger.info('socket_connected', { socketId: socket.id });
  socket.on('disconnect', () => {
    logger.info('socket_disconnected', { socketId: socket.id });
  });
});

app.set('io', io);

server.listen(env.port, () => {
  logger.info('server_started', { port: env.port, clientOrigin: env.clientOrigin });
});

function shutdown(signal) {
  logger.warn('server_shutdown_signal', { signal });
  server.close(() => {
    logger.info('server_stopped', { signal });
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('server_forced_shutdown', { signal });
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
