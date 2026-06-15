const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('./auth');
const contestEngine = require('../engine/contestEngine');

const router = express.Router();

let gameEngine = null;

function setGameEngine(engine) {
  gameEngine = engine;
}

router.get('/current', authMiddleware, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  let contest = db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
  
  if (!contest) {
    return res.json({ contest: null, entries: [], standings: [] });
  }
  
  const userEntry = db.prepare(`
    SELECT * FROM contest_entries 
    WHERE contest_id = ? AND player_id = ?
  `).get(contest.id, req.userId);
  
  const standings = gameEngine ? gameEngine.getContestStandings(contest.id) : [];
  
  res.json({
    contest,
    userEntry: userEntry ? {
      ...userEntry,
      soundWaveData: JSON.parse(userEntry.sound_wave_data || '{}')
    } : null,
    standings: standings.slice(0, 50),
    participantCount: contest.participant_count
  });
});

router.post('/join', authMiddleware, (req, res) => {
  const { detectorId } = req.body;
  
  if (!gameEngine) {
    return res.status(500).json({ error: '游戏引擎未初始化' });
  }
  
  try {
    const result = gameEngine.joinContest(req.userId, detectorId);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/standings/:contestId', authMiddleware, (req, res) => {
  const { contestId } = req.params;
  
  if (!gameEngine) {
    const db = getDb();
    const entries = db.prepare(`
      SELECT ce.*, p.nickname, p.avatar
      FROM contest_entries ce
      JOIN players p ON ce.player_id = p.id
      WHERE ce.contest_id = ?
      ORDER BY ce.score DESC
      LIMIT 100
    `).all(contestId);
    return res.json({ standings: entries });
  }
  
  const standings = gameEngine.getContestStandings(contestId);
  res.json({ standings: standings.slice(0, 100) });
});

router.post('/skill', authMiddleware, (req, res) => {
  const { skillType, targetEntryId } = req.body;
  const db = getDb();
  
  const today = new Date().toISOString().split('T')[0];
  const contest = db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
  
  if (!contest || contest.status !== 'active') {
    return res.status(400).json({ error: '比赛未进行中' });
  }
  
  const entry = db.prepare(`
    SELECT * FROM contest_entries 
    WHERE contest_id = ? AND player_id = ?
  `).get(contest.id, req.userId);
  
  if (!entry) {
    return res.status(400).json({ error: '未参加比赛' });
  }
  
  let targetEntry = null;
  if (skillType === 'interference_pulse' && targetEntryId) {
    targetEntry = db.prepare('SELECT * FROM contest_entries WHERE id = ?').get(targetEntryId);
  }
  
  const result = contestEngine.applySkill(entry, skillType, targetEntry);
  
  if (!result?.success) {
    return res.status(400).json({ error: result?.reason || '技能使用失败' });
  }
  
  if (global.io) {
    global.io.to(`contest_${contest.id}`).emit('skill_used', {
      entryId: entry.id,
      skillType,
      effect: result.effect,
      timestamp: Date.now()
    });
  }
  
  res.json({ success: true, ...result });
});

router.get('/history', authMiddleware, (req, res) => {
  const db = getDb();
  const entries = db.prepare(`
    SELECT ce.*, c.date, c.theme, c.status
    FROM contest_entries ce
    JOIN contests c ON ce.contest_id = c.id
    WHERE ce.player_id = ?
    ORDER BY c.date DESC
    LIMIT 20
  `).all(req.userId);
  
  res.json({ history: entries });
});

router.get('/rewards/:entryId', authMiddleware, (req, res) => {
  const { entryId } = req.params;
  const db = getDb();
  
  const entry = db.prepare('SELECT * FROM contest_entries WHERE id = ? AND player_id = ?').get(entryId, req.userId);
  
  if (!entry) {
    return res.status(404).json({ error: '参赛记录不存在' });
  }
  
  const contest = db.prepare('SELECT * FROM contests WHERE id = ?').get(entry.contest_id);
  const allEntries = db.prepare('SELECT COUNT(*) as count FROM contest_entries WHERE contest_id = ?').get(entry.contest_id).count;
  
  const rewards = contestEngine.calculateMatchRewards(entry.rank || 100, allEntries);
  
  res.json({
    entry,
    contest,
    rewards,
    rank: entry.rank,
    totalParticipants: allEntries
  });
});

module.exports = router;
module.exports.setGameEngine = setGameEngine;
