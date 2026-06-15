const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('./auth');

const router = express.Router();

let gameEngine = null;

function setGameEngine(engine) {
  gameEngine = engine;
}

router.get('/recipes', authMiddleware, (req, res) => {
  const db = getDb();
  const recipes = db.prepare('SELECT * FROM recipes ORDER BY tier ASC').all();
  
  const recipesWithMaterials = recipes.map(recipe => ({
    ...recipe,
    materials: JSON.parse(recipe.materials)
  }));
  
  res.json({ recipes: recipesWithMaterials });
});

router.get('/materials', authMiddleware, (req, res) => {
  const db = getDb();
  const materials = db.prepare(`
    SELECT pm.*, m.name, m.type, m.rarity, m.icon, m.description, m.quality as base_quality
    FROM player_materials pm
    JOIN materials m ON pm.material_id = m.id
    WHERE pm.player_id = ?
  `).all(req.userId);
  
  res.json({ materials });
});

router.get('/detectors', authMiddleware, (req, res) => {
  const db = getDb();
  const detectors = db.prepare(`
    SELECT * FROM detectors 
    WHERE player_id = ?
    ORDER BY quality DESC, created_at DESC
  `).all(req.userId);
  
  const detectorsWithData = detectors.map(d => ({
    ...d,
    affixes: JSON.parse(d.affixes || '[]'),
    hiddenAttributes: JSON.parse(d.hidden_attributes || '[]')
  }));
  
  res.json({ detectors: detectorsWithData });
});

router.post('/start', authMiddleware, (req, res) => {
  const { recipeId, echosmithId, materials } = req.body;
  
  if (!gameEngine) {
    return res.status(500).json({ error: '游戏引擎未初始化' });
  }
  
  try {
    const result = gameEngine.startCrafting(req.userId, recipeId, echosmithId, materials);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/tasks', authMiddleware, (req, res) => {
  const db = getDb();
  const tasks = db.prepare(`
    SELECT ct.*, r.name as recipe_name, r.tier, r.craft_time
    FROM crafting_tasks ct
    JOIN recipes r ON ct.recipe_id = r.id
    WHERE ct.player_id = ?
    ORDER BY ct.start_time DESC
    LIMIT 20
  `).all(req.userId);
  
  res.json({ tasks });
});

router.post('/claim/:taskId', authMiddleware, (req, res) => {
  const { taskId } = req.params;
  const db = getDb();
  
  const task = db.prepare('SELECT * FROM crafting_tasks WHERE id = ? AND player_id = ?').get(taskId, req.userId);
  
  if (!task) {
    return res.status(404).json({ error: '任务不存在' });
  }
  
  if (task.status !== 'completed') {
    return res.status(400).json({ error: '制作尚未完成' });
  }
  
  const detector = db.prepare('SELECT * FROM detectors WHERE id = ?').get(task.result_detector_id);
  
  res.json({ 
    success: true, 
    detector: {
      ...detector,
      affixes: JSON.parse(detector.affixes || '[]'),
      hiddenAttributes: JSON.parse(detector.hidden_attributes || '[]')
    }
  });
});

router.get('/preview', authMiddleware, (req, res) => {
  const { recipeId, echosmithId, qualityBonus = 0 } = req.query;
  const db = getDb();
  
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
  const echosmith = db.prepare('SELECT * FROM echosmiths WHERE id = ?').get(echosmithId);
  
  if (!recipe || !echosmith) {
    return res.status(400).json({ error: '配方或回声师不存在' });
  }
  
  const materials = JSON.parse(recipe.materials);
  
  const avgQuality = 50 + qualityBonus * 10;
  const skillAvg = (echosmith.hearing_skill + echosmith.modulation_skill + echosmith.detection_skill) / 3;
  
  const estimatedQuality = Math.min(100, avgQuality * 0.6 + skillAvg * 6);
  const estimatedRange = Math.floor(recipe.base_range * (estimatedQuality / 50));
  const estimatedPrecision = Math.min(100, Math.floor(recipe.base_precision * (estimatedQuality / 60)));
  
  const rarityChances = {
    legendary: estimatedQuality >= 90 ? 0.1 : 0,
    epic: estimatedQuality >= 75 ? 0.2 : 0,
    rare: estimatedQuality >= 60 ? 0.4 : 0.1,
    uncommon: estimatedQuality >= 40 ? 0.5 : 0.2,
    common: 1
  };
  
  res.json({
    estimated: {
      quality: Math.floor(estimatedQuality),
      range: estimatedRange,
      precision: estimatedPrecision,
      craftTime: recipe.craft_time
    },
    rarityChances,
    recipe,
    materials
  });
});

module.exports = router;
module.exports.setGameEngine = setGameEngine;
