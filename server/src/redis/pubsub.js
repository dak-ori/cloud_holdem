import { getRedis } from './client.js';
import Redis from 'ioredis';

let subscriber;
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
  await sub.subscribe(`game:${gameId}`);
  sub.on('message', (channel, message) => {
    if (channel === `game:${gameId}`) {
      callback(JSON.parse(message));
    }
  });
}

export async function unsubscribe(gameId) {
  const sub = getSubscriber();
  await sub.unsubscribe(`game:${gameId}`);
}
