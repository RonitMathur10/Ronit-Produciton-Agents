'use strict';

const Redis = require('ioredis');

let redis;
const memory = new Map();

function getRedis() {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    redis = {
      async get(key) { return memory.has(key) ? memory.get(key) : null; },
      async set(key, val, _mode, _ttl) { memory.set(key, val); return 'OK'; },
    };
    return redis;
  }
  const client = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
  client.on('error', () => {});
  redis = {
    async get(key) {
      try { return await client.get(key); } catch { return memory.has(key) ? memory.get(key) : null; }
    },
    async set(key, val, mode, ttl) {
      try {
        if (mode === 'EX' && typeof ttl === 'number') return await client.set(key, val, mode, ttl);
        return await client.set(key, val);
      } catch {
        memory.set(key, val);
        return 'OK';
      }
    }
  };
  return redis;
}

module.exports = { getRedis };