const { getDb } = require('../db/database');
const { cacheGet, cacheSet, cacheDel } = require('../db/redis');

function calculateSuggestedPrice(itemType, itemData) {
  const db = getDb();
  
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  
  let transactions;
  
  if (itemType === 'material') {
    transactions = db.prepare(`
      SELECT price FROM market_transactions
      WHERE item_type = 'material' 
      AND JSON_EXTRACT(item_data, '$.material_id') = ?
      AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 20
    `).all(itemData.material_id, sevenDaysAgo);
  } else if (itemType === 'detector') {
    transactions = db.prepare(`
      SELECT price FROM market_transactions
      WHERE item_type = 'detector'
      AND JSON_EXTRACT(item_data, '$.tier') = ?
      AND JSON_EXTRACT(item_data, '$.rarity') = ?
      AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 20
    `).all(itemData.tier, itemData.rarity, sevenDaysAgo);
  }
  
  if (!transactions || transactions.length === 0) {
    return getDefaultPrice(itemType, itemData);
  }
  
  const prices = transactions.map(t => t.price).sort((a, b) => a - b);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  const minPrice = Math.floor(avgPrice * 0.85);
  const maxPrice = Math.floor(avgPrice * 1.15);
  
  return {
    min: minPrice,
    max: maxPrice,
    average: Math.floor(avgPrice),
    sampleSize: transactions.length
  };
}

function getDefaultPrice(itemType, itemData) {
  const rarityPrices = {
    common: 50,
    uncommon: 150,
    rare: 500,
    epic: 2000,
    legendary: 10000
  };
  
  if (itemType === 'material') {
    const basePrice = rarityPrices[itemData.rarity] || 50;
    return {
      min: Math.floor(basePrice * 0.7),
      max: Math.floor(basePrice * 1.3),
      average: basePrice,
      sampleSize: 0
    };
  }
  
  if (itemType === 'detector') {
    const tierMultiplier = Math.pow(1.5, (itemData.tier || 1) - 1);
    const rarityBase = rarityPrices[itemData.rarity] || 100;
    const basePrice = Math.floor(rarityBase * tierMultiplier * 3);
    
    return {
      min: Math.floor(basePrice * 0.7),
      max: Math.floor(basePrice * 1.3),
      average: basePrice,
      sampleSize: 0
    };
  }
  
  return { min: 100, max: 200, average: 150, sampleSize: 0 };
}

function getPriceTrend(itemType, itemId, days = 7) {
  const db = getDb();
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
  
  let transactions;
  
  if (itemType === 'material') {
    transactions = db.prepare(`
      SELECT price, timestamp FROM market_transactions
      WHERE item_type = 'material'
      AND JSON_EXTRACT(item_data, '$.material_id') = ?
      AND timestamp > ?
      ORDER BY timestamp ASC
    `).all(itemId, startTime);
  } else {
    transactions = db.prepare(`
      SELECT price, timestamp FROM market_transactions
      WHERE item_type = ?
      AND JSON_EXTRACT(item_data, '$.id') = ?
      AND timestamp > ?
      ORDER BY timestamp ASC
    `).all(itemType, itemId, startTime);
  }
  
  const dailyPrices = {};
  transactions.forEach(t => {
    const day = new Date(t.timestamp).toDateString();
    if (!dailyPrices[day]) {
      dailyPrices[day] = { total: 0, count: 0 };
    }
    dailyPrices[day].total += t.price;
    dailyPrices[day].count++;
  });
  
  const trend = Object.entries(dailyPrices).map(([day, data]) => ({
    date: day,
    average: Math.floor(data.total / data.count),
    volume: data.count
  }));
  
  return trend;
}

function checkSoundTide() {
  const db = getDb();
  
  const activeTide = db.prepare(`
    SELECT * FROM sound_tide_events
    WHERE active = 1
    AND (event_time + duration * 1000) > ?
    ORDER BY event_time DESC
    LIMIT 1
  `).get(Date.now());
  
  if (activeTide) {
    return {
      active: true,
      event: activeTide,
      bonusRate: activeTide.bonus_rate,
      remainingTime: (activeTide.event_time + activeTide.duration * 1000 - Date.now()) / 1000
    };
  }
  
  return { active: false, bonusRate: 0 };
}

function triggerSoundTide(triggeredBy, duration = 3600, bonusRate = 0.15) {
  const db = getDb();
  const { v4: uuid } = require('uuid');
  
  const tideId = uuid();
  
  db.prepare(`
    INSERT INTO sound_tide_events (id, event_time, bonus_rate, duration, triggered_by, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(tideId, Date.now(), bonusRate, duration, triggeredBy);
  
  cacheDel('sound_tide_status');
  
  return {
    id: tideId,
    startTime: Date.now(),
    duration,
    bonusRate,
    triggeredBy
  };
}

function getDetectionSuccessRate(baseRate, bonuses = {}) {
  let rate = baseRate;
  
  const tideStatus = checkSoundTide();
  if (tideStatus.active) {
    rate += tideStatus.bonusRate;
  }
  
  if (bonuses.guildBonus) {
    rate += bonuses.guildBonus;
  }
  
  if (bonuses.workshopBonus) {
    rate += bonuses.workshopBonus;
  }
  
  return Math.min(0.95, Math.max(0.05, rate));
}

module.exports = {
  calculateSuggestedPrice,
  getPriceTrend,
  checkSoundTide,
  triggerSoundTide,
  getDetectionSuccessRate
};
