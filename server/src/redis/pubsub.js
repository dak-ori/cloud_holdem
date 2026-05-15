const { redis, createSubscriber } = require('./client');

const subscriber = createSubscriber();
const listeners = new Map();

subscriber.on('message', (channel, message) => {
  const callbacks = listeners.get(channel);
  if (callbacks) {
    const data = JSON.parse(message);
    callbacks.forEach(cb => cb(data));
  }
});

async function subscribeGame(gameId, callback) {
  const channel = `game:${gameId}`;
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set());
    await subscriber.subscribe(channel);
  }
  listeners.get(channel).add(callback);
}

async function unsubscribeGame(gameId, callback) {
  const channel = `game:${gameId}`;
  const callbacks = listeners.get(channel);
  if (!callbacks) return;
  callbacks.delete(callback);
  if (callbacks.size === 0) {
    listeners.delete(channel);
    await subscriber.unsubscribe(channel);
  }
}

async function publishGameEvent(gameId, event) {
  await redis.publish(`game:${gameId}`, JSON.stringify(event));
}

module.exports = { subscribeGame, unsubscribeGame, publishGameEvent };
