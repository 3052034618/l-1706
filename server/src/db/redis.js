let cacheStore = new Map();
let redisAvailable = false;

async function initRedis() {
  try {
    redisAvailable = false;
    console.log('ℹ️  Redis不可用，使用内存缓存模式');
  } catch (error) {
    console.warn('⚠️  Redis初始化失败，使用内存缓存模式');
    redisAvailable = false;
  }
  return null;
}

function getRedis() {
  return null;
}

async function cacheGet(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  
  if (entry.expireAt && Date.now() > entry.expireAt) {
    cacheStore.delete(key);
    return null;
  }
  
  return entry.value;
}

async function cacheSet(key, value, ttlSeconds = 300) {
  cacheStore.set(key, {
    value,
    expireAt: Date.now() + ttlSeconds * 1000
  });
}

async function cacheDel(key) {
  cacheStore.delete(key);
}

module.exports = { initRedis, getRedis, cacheGet, cacheSet, cacheDel };
