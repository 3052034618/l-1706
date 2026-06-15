const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/database');
const { authMiddleware } = require('./auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT workshop_id FROM players WHERE id = ?').get(req.userId);
  
  if (!player.workshop_id) {
    return res.json({ workshop: null, echosmiths: [] });
  }

  const workshop = db.prepare('SELECT * FROM workshops WHERE id = ?').get(player.workshop_id);
  const echosmiths = db.prepare('SELECT * FROM echosmiths WHERE workshop_id = ?').all(player.workshop_id);
  const memberCount = db.prepare('SELECT COUNT(*) as count FROM echosmiths WHERE workshop_id = ?').get(player.workshop_id).count;

  res.json({ workshop, echosmiths, memberCount });
});

router.post('/create', authMiddleware, (req, res) => {
  const { name } = req.body;
  const db = getDb();
  
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  
  if (player.workshop_id) {
    return res.status(400).json({ error: '你已经拥有工坊了' });
  }

  const workshopId = uuid();
  
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO workshops (id, name, owner_id, level, max_members, created_at)
      VALUES (?, ?, ?, 1, 5, ?)
    `).run(workshopId, name, req.userId, Date.now());

    db.prepare('UPDATE players SET workshop_id = ? WHERE id = ?').run(workshopId, req.userId);

    const echosmithId = uuid();
    db.prepare(`
      INSERT INTO echosmiths (id, workshop_id, player_id, name, role, hearing_skill, modulation_skill, detection_skill, is_chief, created_at)
      VALUES (?, ?, ?, ?, 'chief', 3, 3, 3, 1, ?)
    `).run(echosmithId, workshopId, req.userId, '首席回声师', Date.now());
  });

  tx();

  res.json({ success: true, workshopId, name });
});

router.post('/upgrade', authMiddleware, (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  const workshop = db.prepare('SELECT * FROM workshops WHERE id = ?').get(player.workshop_id);

  if (!workshop) {
    return res.status(400).json({ error: '没有工坊' });
  }

  if (workshop.owner_id !== req.userId) {
    return res.status(403).json({ error: '只有馆长可以升级' });
  }

  const upgradeCost = workshop.level * 500;
  if (player.gold < upgradeCost) {
    return res.status(400).json({ error: '金币不足' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(upgradeCost, req.userId);
    db.prepare(`
      UPDATE workshops 
      SET level = level + 1, 
          max_members = max_members + 2,
          crafting_speed_bonus = crafting_speed_bonus + 0.05,
          quality_bonus = quality_bonus + 0.03
      WHERE id = ?
    `).run(workshop.id);
  });

  tx();

  const updatedWorkshop = db.prepare('SELECT * FROM workshops WHERE id = ?').get(workshop.id);
  res.json({ success: true, workshop: updatedWorkshop });
});

router.post('/echosmiths/recruit', authMiddleware, (req, res) => {
  const { name, skills } = req.body;
  const db = getDb();
  
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  const workshop = db.prepare('SELECT * FROM workshops WHERE id = ?').get(player.workshop_id);

  if (!workshop) {
    return res.status(400).json({ error: '没有工坊' });
  }

  const currentCount = db.prepare('SELECT COUNT(*) as count FROM echosmiths WHERE workshop_id = ?').get(workshop.id).count;
  if (currentCount >= workshop.max_members) {
    return res.status(400).json({ error: '工坊人数已满' });
  }

  const hireCost = 200;
  if (player.gold < hireCost) {
    return res.status(400).json({ error: '金币不足' });
  }

  const echosmithId = uuid();
  
  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(hireCost, req.userId);
    
    const hearing = skills?.hearing || Math.floor(Math.random() * 3) + 1;
    const modulation = skills?.modulation || Math.floor(Math.random() * 3) + 1;
    const detection = skills?.detection || Math.floor(Math.random() * 3) + 1;
    
    db.prepare(`
      INSERT INTO echosmiths (id, workshop_id, name, role, hearing_skill, modulation_skill, detection_skill, is_chief, hire_cost, created_at)
      VALUES (?, ?, ?, 'member', ?, ?, ?, 0, ?, ?)
    `).run(echosmithId, workshop.id, name || '新手回声师', hearing, modulation, detection, hireCost, Date.now());
  });

  tx();

  const echosmith = db.prepare('SELECT * FROM echosmiths WHERE id = ?').get(echosmithId);
  res.json({ success: true, echosmith });
});

router.post('/echosmiths/:id/promote', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { skillType } = req.body;
  const db = getDb();
  
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  const workshop = db.prepare('SELECT * FROM workshops WHERE id = ?').get(player.workshop_id);
  const echosmith = db.prepare('SELECT * FROM echosmiths WHERE id = ?').get(id);

  if (!echosmith || echosmith.workshop_id !== workshop.id) {
    return res.status(404).json({ error: '回声师不存在' });
  }

  if (workshop.owner_id !== req.userId) {
    return res.status(403).json({ error: '只有馆长可以晋升成员' });
  }

  const upgradeCost = 100 * (echosmith.level || 1);
  if (player.gold < upgradeCost) {
    return res.status(400).json({ error: '金币不足' });
  }

  const skillColumn = `${skillType}_skill`;
  if (!['hearing', 'modulation', 'detection'].includes(skillType)) {
    return res.status(400).json({ error: '无效的技能类型' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE players SET gold = gold - ? WHERE id = ?').run(upgradeCost, req.userId);
    db.prepare(`
      UPDATE echosmiths 
      SET ${skillColumn} = ${skillColumn} + 1,
          level = level + 1,
          exp = 0
      WHERE id = ?
    `).run(id);
  });

  tx();

  const updated = db.prepare('SELECT * FROM echosmiths WHERE id = ?').get(id);
  res.json({ success: true, echosmith: updated });
});

module.exports = router;
