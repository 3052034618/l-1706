const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'echo-workshop-secret-key';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const headerToken = req.headers.authorization?.replace('Bearer ', '');
  const queryToken = req.query.token;
  const token = headerToken || queryToken;
  
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

router.post('/register', async (req, res) => {
  const { username, password, nickname } = req.body;
  const db = getDb();

  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  const existing = db.prepare('SELECT id FROM players WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const playerId = uuid();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO players (id, username, password, nickname, level, exp, gold, crystals, created_at, last_login)
      VALUES (?, ?, ?, ?, 1, 0, 1000, 50, ?, ?)
    `).run(playerId, username, hashedPassword, nickname || username, Date.now(), Date.now());

    const starterMaterials = [
      { material_id: 'mat_crystal_common', quantity: 20, quality: 30 },
      { material_id: 'mat_resonator_wood', quantity: 15, quality: 25 },
      { material_id: 'mat_core_basic', quantity: 5, quality: 40 },
      { material_id: 'mat_amplifier_small', quantity: 8, quality: 35 }
    ];

    starterMaterials.forEach(m => {
      db.prepare(`
        INSERT INTO player_materials (id, player_id, material_id, quantity, quality)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuid(), playerId, m.material_id, m.quantity, m.quality);
    });

    const workshopId = uuid();
    db.prepare(`
      INSERT INTO workshops (id, name, owner_id, level, max_members, created_at)
      VALUES (?, ?, ?, 1, 5, ?)
    `).run(workshopId, `${nickname || username}的工坊`, playerId, Date.now());

    db.prepare('UPDATE players SET workshop_id = ? WHERE id = ?').run(workshopId, playerId);

    const echosmithId = uuid();
    db.prepare(`
      INSERT INTO echosmiths (id, workshop_id, player_id, name, role, hearing_skill, modulation_skill, detection_skill, is_chief, created_at)
      VALUES (?, ?, ?, ?, 'chief', 3, 3, 3, 1, ?)
    `).run(echosmithId, workshopId, playerId, '首席回声师', Date.now());
  });

  tx();

  const token = generateToken(playerId);
  res.json({ token, playerId, username, nickname: nickname || username });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const db = getDb();

  const player = db.prepare('SELECT * FROM players WHERE username = ?').get(username);
  
  if (!player) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const valid = await bcrypt.compare(password, player.password);
  if (!valid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  db.prepare('UPDATE players SET last_login = ? WHERE id = ?').run(Date.now(), player.id);

  const token = generateToken(player.id);
  res.json({
    token,
    player: {
      id: player.id,
      username: player.username,
      nickname: player.nickname,
      avatar: player.avatar,
      level: player.level,
      gold: player.gold,
      crystals: player.crystals,
      workshopId: player.workshop_id,
      guildId: player.guild_id
    }
  });
});

router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const player = db.prepare(`
    SELECT id, username, nickname, avatar, level, exp, gold, crystals, 
           contest_points, collection_score, workshop_id, guild_id
    FROM players WHERE id = ?
  `).get(req.userId);

  if (!player) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const workshop = db.prepare('SELECT * FROM workshops WHERE id = ?').get(player.workshop_id);
  const echosmiths = db.prepare('SELECT * FROM echosmiths WHERE workshop_id = ?').all(player.workshop_id);
  const materials = db.prepare(`
    SELECT pm.*, m.name, m.type, m.rarity, m.icon, m.description
    FROM player_materials pm
    JOIN materials m ON pm.material_id = m.id
    WHERE pm.player_id = ?
  `).all(req.userId);

  const detectors = db.prepare(`
    SELECT * FROM detectors 
    WHERE player_id = ?
    ORDER BY quality DESC
  `).all(req.userId);

  res.json({
    player,
    workshop,
    echosmiths,
    materials,
    detectors
  });
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
