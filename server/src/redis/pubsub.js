import { getRedis } from './client.js';
import Redis from 'ioredis';

let subscriber;
const handlers = new Map(); // gameId → handler function
export function getSubscriber() {
  if (!subscriber) {
    subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
    subscriber.on('error', (err) => {
      console.error('[Redis Subscriber] Connection error:', err.message);
    });
  }
  return subscriber;
}

export async function publish(gameId, event) {
  const redis = getRedis();
  await redis.publish(`game:${gameId}`, JSON.stringify(event));
}

export async function subscribe(gameId, callback) {
  const sub = getSubscriber();

  // 이미 구독 중이면 기존 핸들러 제거
  if (handlers.has(gameId)) {
    sub.removeListener('message', handlers.get(gameId));
  }

  const handler = (channel, message) => {
    if (channel === `game:${gameId}`) {
      try {
        callback(JSON.parse(message));
      } catch (err) {
        console.error(`[PubSub] Parse error for ${gameId}:`, err.message);
      }
    }
  };

  handlers.set(gameId, handler);
  sub.on('message', handler);
  await sub.subscribe(`game:${gameId}`);
}

export async function unsubscribe(gameId) {
  const sub = getSubscriber();
  if (handlers.has(gameId)) {
    sub.removeListener('message', handlers.get(gameId));
    handlers.delete(gameId);
  }
  await sub.unsubscribe(`game:${gameId}`);
}
