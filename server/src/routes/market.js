const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/database');
const { authMiddleware } = require('./auth');
const { calculateSuggestedPrice, getPriceTrend, checkSoundTide } = require('../engine/marketEngine');

const router = express.Router();

let gameEngine = null;

function setGameEngine(engine) {
  gameEngine = engine;
}

router.get('/listings', authMiddleware, (req, res) => {
  const db = getDb();
  const { type = 'all', sort = 'price', order = 'asc', page = 1, limit = 20 } = req.query;
  
  let whereClause = "WHERE status = 'active'";
  if (type !== 'all') {
    whereClause += ` AND item_type = '${type}'`;
  }
  
  const validSorts = ['price', 'listed_at', 'quality'];
  const sortField = validSorts.includes(sort) ? sort : 'price';
  const sortOrder = order === 'desc' ? 'DESC' : 'ASC';
  
  const query = `
    SELECT * FROM market_listings
    ${whereClause}
    ORDER BY ${sortField} ${sortOrder}
    LIMIT ${(page - 1) * limit}, ${limit}
  `;
  
  const listings = db.prepare(query).all();
  
  const sellerIds = [...new Set(listings.map(l => l.seller_id))];
  const players = {};
  if (sellerIds.length > 0) {
    const placeholders = sellerIds.map(() => '?').join(',');
    const playerRows = db.prepare(`SELECT id, nickname, avatar FROM players WHERE id IN (${placeholders})`).all(...sellerIds);
    playerRows.forEach(p => { players[p.id] = p; });
  }
  
  const listingsWithData = listings.map(l => ({
    ...l,
    seller_name: players[l.seller_id]?.nickname || '未知',
    seller_avatar: players[l.seller_id]?.avatar || null,
    itemData: JSON.parse(l.item_data || '{}')
  }));
  
  const countResult = db.prepare(`SELECT COUNT(*) as count FROM market_listings ${whereClause}`).get();
  const total = countResult ? countResult.count : 0;
  
  res.json({ listings: listingsWithData, total, page: parseInt(page), limit: parseInt(limit) });
});

router.get('/my-listings', authMiddleware, (req, res) => {
  const db = getDb();
  const listings = db.prepare(`
    SELECT * FROM market_listings 
    WHERE seller_id = ?
    ORDER BY listed_at DESC
  `).all(req.userId);
  
  const listingsWithData = listings.map(l => ({
    ...l,
    itemData: JSON.parse(l.item_data || '{}')
  }));
  
  res.json({ listings: listingsWithData });
});

router.post('/list', authMiddleware, (req, res) => {
  const { itemType, itemId, price, itemData } = req.body;
  const db = getDb();
  
  if (!itemType || !itemId || !price) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  if (itemType === 'material') {
    const material = db.prepare(`
      SELECT * FROM player_materials 
      WHERE player_id = ? AND material_id = ?
    `).get(req.userId, itemId);
    
    if (!material || material.quantity < (itemData?.quantity || 1)) {
      return res.status(400).json({ error: '材料数量不足' });
    }
  } else if (itemType === 'detector') {
    const detector = db.prepare(`
      SELECT * FROM detectors WHERE id = ? AND player_id = ?
    `).get(itemId, req.userId);
    
    if (!detector || !detector.is_tradable) {
      return res.status(400).json({ error: '该探测器不可交易' });
    }
  }
  
  const suggested = calculateSuggestedPrice(itemType, itemData || {});
  
  const listingId = uuid();
  
  const tx = db.transaction(() => {
    if (itemType === 'material') {
      db.prepare(`
        UPDATE player_materials 
        SET quantity = quantity - ?
        WHERE player_id = ? AND material_id = ?
      `).run(itemData?.quantity || 1, req.userId, itemId);
    } else if (itemType === 'detector') {
      db.prepare('UPDATE detectors SET is_tradable = 0 WHERE id = ?').run(itemId);
    }
    
    db.prepare(`
      INSERT INTO market_listings 
      (id, seller_id, item_type, item_id, item_data, price, suggested_price_min, suggested_price_max, status, listed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      listingId, 
      req.userId, 
      itemType, 
      itemId, 
      JSON.stringify(itemData || {}),
      price,
      suggested.min,
      suggested.max,
      Date.now()
    );
  });
  
  tx();
  
  res.json({ 
    success: true, 
    listingId,
    suggestedPrice: suggested
  });
});

router.post('/cancel/:listingId', authMiddleware, (req, res) => {
  const { listingId } = req.params;
  const db = getDb();
  
  const listing = db.prepare('SELECT * FROM market_listings WHERE id = ? AND seller_id = ?').get(listingId, req.userId);
  
  if (!listing) {
    return res.status(404).json({ error: '商品不存在' });
  }
  
  if (listing.status !== 'active') {
    return res.status(400).json({ error: '商品无法取消' });
  }
  
  const itemData = JSON.parse(listing.item_data || '{}');
  
  const tx = db.transaction(() => {
    db.prepare('UPDATE market_listings SET status = "cancelled" WHERE id = ?').run(listingId);
    
    if (listing.item_type === 'material') {
      const existing = db.prepare(`
        SELECT * FROM player_materials WHERE player_id = ? AND material_id = ?
      `).get(req.userId, listing.item_id);
      
      if (existing) {
        db.prepare(`
          UPDATE player_materials SET quantity = quantity + ?
          WHERE player_id = ? AND material_id = ?
        `).run(itemData?.quantity || 1, req.userId, listing.item_id);
      } else {
        db.prepare(`
          INSERT INTO player_materials (id, player_id, material_id, quantity, quality)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuid(), req.userId, listing.item_id, itemData?.quantity || 1, itemData?.quality || 50);
      }
    } else if (listing.item_type === 'detector') {
      db.prepare('UPDATE detectors SET is_tradable = 1 WHERE id = ?').run(listing.item_id);
    }
  });
  
  tx();
  
  res.json({ success: true });
});

router.post('/buy/:listingId', authMiddleware, (req, res) => {
  const { listingId } = req.params;
  
  if (!gameEngine) {
    return res.status(500).json({ error: '系统错误' });
  }
  
  try {
    const result = gameEngine.purchaseListing(listingId, req.userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/suggested-price', authMiddleware, (req, res) => {
  const { itemType, itemId, tier, rarity } = req.query;
  
  const itemData = {
    material_id: itemId,
    tier: parseInt(tier) || 1,
    rarity: rarity || 'common'
  };
  
  const suggested = calculateSuggestedPrice(itemType, itemData);
  const trend = getPriceTrend(itemType, itemId, 7, itemData);
  
  res.json({ suggested, trend });
});

router.get('/sound-tide', authMiddleware, (req, res) => {
  const tideStatus = checkSoundTide();
  res.json(tideStatus);
});

router.get('/transactions', authMiddleware, (req, res) => {
  const db = getDb();
  const transactions = db.prepare(`
    SELECT mt.*, p1.nickname as seller_name, p2.nickname as buyer_name
    FROM market_transactions mt
    JOIN players p1 ON mt.seller_id = p1.id
    JOIN players p2 ON mt.buyer_id = p2.id
    WHERE mt.seller_id = ? OR mt.buyer_id = ?
    ORDER BY mt.timestamp DESC
    LIMIT 20
  `).all(req.userId, req.userId);
  
  res.json({ transactions });
});

module.exports = router;
module.exports.setGameEngine = setGameEngine;
