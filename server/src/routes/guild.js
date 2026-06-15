const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/database');
const { authMiddleware } = require('./auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT guild_id FROM players WHERE id = ?').get(req.userId);
  
  if (!player.guild_id) {
    return res.json({ guild: null, isMember: false });
  }
  
  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(player.guild_id);
  const members = db.prepare(`
    SELECT gm.*, p.nickname, p.avatar, p.level, p.collection_score, p.contest_points
    FROM guild_members gm
    JOIN players p ON gm.player_id = p.id
    WHERE gm.guild_id = ?
    ORDER BY gm.contribution DESC
  `).all(player.guild_id);
  
  const tower = db.prepare('SELECT * FROM resonance_towers WHERE guild_id = ?').get(player.guild_id);
  const workshops = db.prepare('SELECT COUNT(*) as count FROM workshops w JOIN players p ON w.owner_id = p.id WHERE p.guild_id = ?').get(player.guild_id).count;
  
  res.json({ guild, members, tower, workshops, isMember: true });
});

router.get('/list', authMiddleware, (req, res) => {
  const db = getDb();
  const { page = 1, limit = 20, sort = 'level' } = req.query;
  
  const validSorts = ['level', 'member_count', 'workshop_count'];
  const sortField = validSorts.includes(sort) ? sort : 'level';
  
  const guilds = db.prepare(`
    SELECT g.*, 
           (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) as member_count
    FROM guilds g
    ORDER BY g.${sortField} DESC
    LIMIT ?, ?
  `).all((page - 1) * limit, limit);
  
  const total = db.prepare('SELECT COUNT(*) as count FROM guilds').get().count;
  
  res.json({ guilds, total, page: parseInt(page), limit: parseInt(limit) });
});

router.post('/create', authMiddleware, (req, res) => {
  const { name } = req.body;
  const db = getDb();
  
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  
  if (player.guild_id) {
    return res.status(400).json({ error: '你已经加入了公会' });
  }
  
  const existing = db.prepare('SELECT id FROM guilds WHERE name = ?').get(name);
  if (existing) {
    return res.status(400).json({ error: '公会名已存在' });
  }
  
  const createCost = 1000;
  if (player.gold < createCost) {
    return res.status(400).json({ error: '金币不足' });
  }
  
  const guildId = uuid();
  const towerId = uuid();
  
  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(createCost, req.userId);
    
    db.prepare(`
      INSERT INTO guilds (id, name, leader_id, level, max_members, created_at)
      VALUES (?, ?, ?, 1, 20, ?)
    `).run(guildId, name, req.userId, Date.now());
    
    db.prepare(`
      INSERT INTO guild_members (id, guild_id, player_id, role, contribution, joined_at)
      VALUES (?, ?, ?, 'leader', 0, ?)
    `).run(uuid(), guildId, req.userId, Date.now());
    
    db.prepare('UPDATE players SET guild_id = ? WHERE id = ?').run(guildId, req.userId);
    
    db.prepare(`
      INSERT INTO resonance_towers (id, guild_id, level, range_bonus, precision_bonus, success_rate_bonus, upgrade_costs)
      VALUES (?, ?, 1, 0.02, 0.02, 0.01, ?)
    `).run(towerId, guildId, JSON.stringify({ gold: 500, materials: [] }));
  });
  
  tx();
  
  res.json({ success: true, guildId, name });
});

router.post('/join/:guildId', authMiddleware, (req, res) => {
  const { guildId } = req.params;
  const db = getDb();
  
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  
  if (player.guild_id) {
    return res.status(400).json({ error: '你已经加入了公会' });
  }
  
  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!guild) {
    return res.status(404).json({ error: '公会不存在' });
  }
  
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM guild_members WHERE guild_id = ?').get(guildId).count;
  if (memberCount >= guild.max_members) {
    return res.status(400).json({ error: '公会人数已满' });
  }
  
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO guild_members (id, guild_id, player_id, role, contribution, joined_at)
      VALUES (?, ?, ?, 'member', 0, ?)
    `).run(uuid(), guildId, req.userId, Date.now());
    
    db.prepare('UPDATE players SET guild_id = ? WHERE id = ?').run(guildId, req.userId);
    
    db.prepare('UPDATE guilds SET workshop_count = workshop_count + 1 WHERE id = ?').run(guildId);
  });
  
  tx();
  
  res.json({ success: true, guildId });
});

router.post('/leave', authMiddleware, (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  
  if (!player.guild_id) {
    return res.status(400).json({ error: '你没有加入公会' });
  }
  
  const membership = db.prepare('SELECT * FROM guild_members WHERE guild_id = ? AND player_id = ?').get(player.guild_id, req.userId);
  
  if (membership.role === 'leader') {
    return res.status(400).json({ error: '公会会长不能退出，请先转让会长' });
  }
  
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM guild_members WHERE guild_id = ? AND player_id = ?').run(player.guild_id, req.userId);
    db.prepare('UPDATE players SET guild_id = NULL WHERE id = ?').run(req.userId);
    db.prepare('UPDATE guilds SET workshop_count = workshop_count - 1 WHERE id = ?').run(player.guild_id);
  });
  
  tx();
  
  res.json({ success: true });
});

router.post('/contribute', authMiddleware, (req, res) => {
  const { amount, type = 'gold' } = req.body;
  const db = getDb();
  
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  
  if (!player.guild_id) {
    return res.status(400).json({ error: '你没有加入公会' });
  }
  
  if (type === 'gold') {
    if (player.gold < amount) {
      return res.status(400).json({ error: '金币不足' });
    }
    
    const tx = db.transaction(() => {
      db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(amount, req.userId);
      
      db.prepare(`
        UPDATE guild_members 
        SET contribution = contribution + ?
        WHERE guild_id = ? AND player_id = ?
      `).run(amount, player.guild_id, req.userId);
      
      const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(player.guild_id);
      const newExp = guild.exp + amount;
      const expToLevel = guild.level * 2000;
      
      if (newExp >= expToLevel) {
        db.prepare(`
          UPDATE guilds 
          SET level = level + 1, 
              exp = ?,
              max_members = max_members + 5,
              craft_success_bonus = craft_success_bonus + 0.02,
              detection_bonus = detection_bonus + 0.02
          WHERE id = ?
        `).run(newExp - expToLevel, player.guild_id);
      } else {
        db.prepare('UPDATE guilds SET exp = ? WHERE id = ?').run(newExp, player.guild_id);
      }
    });
    
    tx();
    
    res.json({ success: true, contributed: amount });
  } else {
    res.status(400).json({ error: '暂不支持该贡献类型' });
  }
});

router.post('/tower/upgrade', authMiddleware, (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  
  if (!player.guild_id) {
    return res.status(400).json({ error: '你没有加入公会' });
  }
  
  const membership = db.prepare('SELECT * FROM guild_members WHERE guild_id = ? AND player_id = ?').get(player.guild_id, req.userId);
  if (membership.role !== 'leader') {
    return res.status(403).json({ error: '只有会长可以升级共鸣塔' });
  }
  
  const tower = db.prepare('SELECT * FROM resonance_towers WHERE guild_id = ?').get(player.guild_id);
  const guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(player.guild_id);
  
  const upgradeCost = tower.level * 1000;
  
  if (guild.level < tower.level + 1) {
    return res.status(400).json({ error: '公会等级不足' });
  }
  
  if (player.gold < upgradeCost) {
    return res.status(400).json({ error: '金币不足' });
  }
  
  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(upgradeCost, req.userId);
    
    db.prepare(`
      UPDATE resonance_towers 
      SET level = level + 1,
          range_bonus = range_bonus + 0.03,
          precision_bonus = precision_bonus + 0.03,
          success_rate_bonus = success_rate_bonus + 0.02
      WHERE guild_id = ?
    `).run(player.guild_id);
    
    db.prepare(`
      UPDATE guilds 
      SET craft_success_bonus = craft_success_bonus + 0.02,
          detection_bonus = detection_bonus + 0.02
      WHERE id = ?
    `).run(player.guild_id);
  });
  
  tx();
  
  const updatedTower = db.prepare('SELECT * FROM resonance_towers WHERE guild_id = ?').get(player.guild_id);
  res.json({ success: true, tower: updatedTower });
});

module.exports = router;
