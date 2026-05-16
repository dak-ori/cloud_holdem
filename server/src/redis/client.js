import Redis from 'ioredis';

let instance;

export function getRedis() {
  if (!instance) {
    instance = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
  }
  return instance;
}
