const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('./auth');

const router = express.Router();

let gameEngine = null;

function setGameEngine(engine) {
  gameEngine = engine;
}

router.get('/:type', authMiddleware, async (req, res) => {
  const { type } = req.params;
  const { limit = 50 } = req.query;
  
  if (!gameEngine) {
    const db = getDb();
    let data = [];
    
    switch (type) {
      case 'collection':
        data = db.prepare(`
          SELECT id, nickname, avatar, level, collection_score
          FROM players
          ORDER BY collection_score DESC
          LIMIT ?
        `).all(limit);
        break;
      case 'contest':
        data = db.prepare(`
          SELECT id, nickname, avatar, level, contest_points
          FROM players
          ORDER BY contest_points DESC
          LIMIT ?
        `).all(limit);
        break;
      case 'guild':
        data = db.prepare(`
          SELECT g.id, g.name, g.level, g.workshop_count,
                 (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) as member_count,
                 (SELECT SUM(contribution) FROM guild_members gm WHERE gm.guild_id = g.id) as total_contribution
          FROM guilds g
          ORDER BY total_contribution DESC
          LIMIT ?
        `).all(limit);
        break;
      default:
        return res.status(400).json({ error: '无效的排行榜类型' });
    }
    
    return res.json({ type, rankings: data });
  }
  
  const data = await gameEngine.getLeaderboard(type, limit);
  res.json({ type, rankings: data });
});

router.get('/me/rank', authMiddleware, async (req, res) => {
  const db = getDb();
  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.userId);
  
  const collectionRank = db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM players
    WHERE collection_score > ?
  `).get(player.collection_score).rank;
  
  const contestRank = db.prepare(`
    SELECT COUNT(*) + 1 as rank
    FROM players
    WHERE contest_points > ?
  `).get(player.contest_points).rank;
  
  const totalPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get().count;
  
  res.json({
    collection: {
      rank: collectionRank,
      score: player.collection_score,
      total: totalPlayers
    },
    contest: {
      rank: contestRank,
      score: player.contest_points,
      total: totalPlayers
    }
  });
});

module.exports = router;
module.exports.setGameEngine = setGameEngine;
