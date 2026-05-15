const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

function createClient() {
  return new Redis(REDIS_URL, { lazyConnect: true });
}

const redis = createClient();

function createSubscriber() {
  return createClient();
}

module.exports = { redis, createSubscriber };
