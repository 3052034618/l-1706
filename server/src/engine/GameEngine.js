const { v4: uuid } = require('uuid');
const { getDb } = require('../db/database');
const { cacheGet, cacheSet, cacheDel } = require('../db/redis');
const { calculateCraftingResult, RARITY_WEIGHTS } = require('./craftingEngine');
const contestEngine = require('./contestEngine');
const { triggerSoundTide, checkSoundTide } = require('./marketEngine');

class GameEngine {
  constructor() {
    this.db = null;
    this.activeContests = new Map();
    this.onlinePlayers = new Set();
    this.craftingTasks = new Map();
    this.contestUpdateTimers = new Map();
    this.entryBuffs = new Map();
  }

  async init() {
    this.db = getDb();
    await this.loadActiveCraftingTasks();
    await this.checkDailyContest();
    console.log('✅ 游戏引擎初始化完成');
  }

  async loadActiveCraftingTasks() {
    const tasks = this.db.prepare(`
      SELECT * FROM crafting_tasks
      WHERE status = 'crafting'
    `).all();

    tasks.forEach(task => {
      this.craftingTasks.set(task.id, {
        ...task,
        timer: setTimeout(() => this.completeCraftingTask(task.id), 
          Math.max(0, task.end_time - Date.now()))
      });
    });

    console.log(`📋 已加载 ${tasks.length} 个制作任务`);
  }

  startCrafting(playerId, recipeId, echosmithId, materials) {
    const recipe = this.db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
    if (!recipe) throw new Error('配方不存在');

    const player = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!player) throw new Error('玩家不存在');

    const echosmith = this.db.prepare('SELECT * FROM echosmiths WHERE id = ?').get(echosmithId);
    if (!echosmith) throw new Error('回声师不存在');

    const workshop = this.db.prepare('SELECT * FROM workshops WHERE id = ?').get(player.workshop_id);
    
    const requiredMaterials = JSON.parse(recipe.materials);
    for (const req of requiredMaterials) {
      const playerMat = this.db.prepare(`
        SELECT * FROM player_materials 
        WHERE player_id = ? AND material_id = ?
      `).get(playerId, req.material_id);
      
      if (!playerMat || playerMat.quantity < req.quantity) {
        throw new Error(`材料不足: ${req.material_id}`);
      }
    }

    const materialsWithInfo = materials.map(m => {
      const matInfo = this.db.prepare('SELECT * FROM materials WHERE id = ?').get(m.material_id || m.id);
      return {
        ...m,
        id: m.material_id || m.id,
        material_id: m.material_id || m.id,
        type: matInfo?.type || 'common',
        quality: m.quality || matInfo?.quality || 50,
        rarity: m.rarity || matInfo?.rarity || 'common',
        quantity: m.quantity || 1
      };
    });

    const taskId = uuid();
    const craftTime = recipe.craft_time * 1000;
    const startTime = Date.now();
    const endTime = startTime + craftTime;

    const tx = this.db.transaction(() => {
      requiredMaterials.forEach(req => {
        this.db.prepare(`
          UPDATE player_materials 
          SET quantity = quantity - ?
          WHERE player_id = ? AND material_id = ?
        `).run(req.quantity, playerId, req.material_id);
      });

      const materialsData = JSON.stringify(materialsWithInfo);
      
      this.db.prepare(`
        INSERT INTO crafting_tasks 
        (id, player_id, workshop_id, recipe_id, echosmith_id, materials, start_time, end_time, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'crafting')
      `).run(taskId, playerId, player.workshop_id, recipeId, echosmithId, materialsData, startTime, endTime);
    });

    tx();

    const timer = setTimeout(() => this.completeCraftingTask(taskId), craftTime);
    this.craftingTasks.set(taskId, { id: taskId, end_time: endTime, timer });

    return { taskId, endTime, craftTime };
  }

  completeCraftingTask(taskId) {
    const task = this.db.prepare('SELECT * FROM crafting_tasks WHERE id = ?').get(taskId);
    if (!task || task.status !== 'crafting') return;

    const recipe = this.db.prepare('SELECT * FROM recipes WHERE id = ?').get(task.recipe_id);
    const echosmith = this.db.prepare('SELECT * FROM echosmiths WHERE id = ?').get(task.echosmith_id);
    const materials = JSON.parse(task.materials);
    const workshop = this.db.prepare('SELECT * FROM workshops WHERE id = ?').get(task.workshop_id);

    const player = this.db.prepare('SELECT * FROM players WHERE id = ?').get(task.player_id);
    
    let guildBonus = 0;
    if (player.guild_id) {
      const guild = this.db.prepare('SELECT * FROM guilds WHERE id = ?').get(player.guild_id);
      if (guild) {
        guildBonus = guild.craft_success_bonus || 0;
      }
    }

    const workshopBonus = workshop ? workshop.quality_bonus || 0 : 0;

    const result = calculateCraftingResult(recipe, materials, echosmith, workshopBonus, guildBonus);

    const detectorId = uuid();
    const detectorName = `${recipe.name} ${generateNickname()}`;

    const tideBonus = checkSoundTide();
    if (tideBonus.active && Math.random() < tideBonus.bonusRate) {
      result.quality = Math.min(100, result.quality + 5);
      result.range = Math.floor(result.range * 1.1);
    }

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO detectors
        (id, player_id, workshop_id, name, recipe_id, tier, range, precision, rarity, affixes, hidden_attributes, quality, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        detectorId,
        task.player_id,
        task.workshop_id,
        detectorName,
        task.recipe_id,
        result.tier,
        result.range,
        result.precision,
        result.rarity,
        JSON.stringify(result.affixes),
        JSON.stringify(result.hiddenAttributes),
        result.quality,
        Date.now()
      );

      this.db.prepare(`
        UPDATE crafting_tasks 
        SET status = 'completed', result_detector_id = ?
        WHERE id = ?
      `).run(detectorId, taskId);

      this.db.prepare(`
        UPDATE players 
        SET collection_score = collection_score + ?
        WHERE id = ?
      `).run(RARITY_WEIGHTS[result.rarity] * 10, task.player_id);
    });

    tx();

    const taskData = this.craftingTasks.get(taskId);
    if (taskData?.timer) {
      clearTimeout(taskData.timer);
    }
    this.craftingTasks.delete(taskId);

    if (global.io) {
      global.io.to(`player_${task.player_id}`).emit('crafting_complete', {
        taskId,
        detector: {
          id: detectorId,
          name: detectorName,
          ...result
        }
      });
    }

    return { detectorId, ...result };
  }

  async checkDailyContest() {
    const today = new Date().toISOString().split('T')[0];
    
    let contest = this.db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
    
    if (!contest) {
      const contestId = uuid();
      const startTime = new Date();
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date();
      endTime.setHours(22, 0, 0, 0);

      const themes = ['深海回音', '森林细语', '风暴之声', '远古回响', '星辰之音'];
      const theme = themes[Math.floor(Math.random() * themes.length)];

      this.db.prepare(`
        INSERT INTO contests (id, date, status, start_time, end_time, theme)
        VALUES (?, ?, 'upcoming', ?, ?, ?)
      `).run(contestId, today, startTime.getTime(), endTime.getTime(), theme);

      contest = this.db.prepare('SELECT * FROM contests WHERE id = ?').get(contestId);
    }

    this.activeContests.set(contest.id, contest);
    
    if (contest.status === 'active') {
      this.startContestUpdates(contest.id);
    }
    
    return contest;
  }

  startContestUpdates(contestId) {
    if (this.contestUpdateTimers.has(contestId)) return;
    
    const timer = setInterval(() => {
      this.updateContestScores(contestId);
    }, 2000);
    
    this.contestUpdateTimers.set(contestId, timer);
    console.log(`🏆 大赛 ${contestId} 实时更新已启动`);
  }

  stopContestUpdates(contestId) {
    const timer = this.contestUpdateTimers.get(contestId);
    if (timer) {
      clearInterval(timer);
      this.contestUpdateTimers.delete(contestId);
    }
  }

  updateContestScores(contestId) {
    const entries = this.db.prepare(`
      SELECT * FROM contest_entries WHERE contest_id = ?
    `).all(contestId);
    
    if (entries.length === 0) return;
    
    const now = Date.now();
    
    entries.forEach(entry => {
      const detector = this.db.prepare('SELECT * FROM detectors WHERE id = ?').get(entry.detector_id);
      if (!detector) return;
      
      const timeElapsed = (now - entry.submitted_at) / 1000;
      const waveData = contestEngine.generateSoundWaveData(detector, timeElapsed);
      
      let intensity = waveData.intensity;
      
      const buffs = this.entryBuffs.get(entry.id) || [];
      buffs.forEach(buff => {
        if (buff.endTime > now) {
          intensity *= buff.multiplier;
        }
      });
      
      const activeBuffs = buffs.filter(b => b.endTime > now);
      this.entryBuffs.set(entry.id, activeBuffs);
      
      const baseScore = contestEngine.calculateBaseScore(detector, { ...waveData, intensity });
      const audienceBonus = contestEngine.calculateAudienceResonance(detector, baseScore.total, timeElapsed);
      const totalScore = Math.floor(baseScore.total + audienceBonus);
      
      this.db.prepare(`
        UPDATE contest_entries 
        SET score = ?, current_intensity = ?, audience_resonance = ?,
            rarity_score = ?, frequency_score = ?, intensity_score = ?
        WHERE id = ?
      `).run(
        totalScore, 
        Math.floor(intensity),
        audienceBonus,
        baseScore.rarity,
        baseScore.frequency,
        baseScore.intensity,
        entry.id
      );
    });
    
    const standings = this.getContestStandings(contestId);
    
    if (global.io) {
      global.io.to(`contest_${contestId}`).emit('contest_update', {
        contestId,
        standings: standings.slice(0, 50),
        timestamp: now
      });
    }
  }

  useContestSkill(playerId, skillType, targetEntryId = null) {
    const today = new Date().toISOString().split('T')[0];
    const contest = this.db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
    
    if (!contest || contest.status !== 'active') {
      throw new Error('比赛未进行中');
    }
    
    const entry = this.db.prepare(`
      SELECT * FROM contest_entries 
      WHERE contest_id = ? AND player_id = ?
    `).get(contest.id, playerId);
    
    if (!entry) {
      throw new Error('未参加比赛');
    }
    
    const skill = contestEngine.SKILL_EFFECTS[skillType];
    if (!skill) {
      throw new Error('技能不存在');
    }
    
    const lastUsed = this.getSkillCooldown(entry.id, skillType);
    const now = Date.now();
    
    if (now - lastUsed < skill.cooldown * 1000) {
      const remaining = Math.ceil((skill.cooldown * 1000 - (now - lastUsed)) / 1000);
      throw new Error(`技能冷却中，剩余 ${remaining} 秒`);
    }
    
    this.setSkillCooldown(entry.id, skillType, now);
    
    let targetEntry = null;
    
    if (skillType === 'focus_boost') {
      const currentBuffs = this.entryBuffs.get(entry.id) || [];
      currentBuffs.push({
        type: 'focus_boost',
        multiplier: skill.effect.intensityMultiplier,
        endTime: now + skill.duration * 1000
      });
      this.entryBuffs.set(entry.id, currentBuffs);
      
    } else if (skillType === 'interference_pulse' && targetEntryId) {
      targetEntry = this.db.prepare('SELECT * FROM contest_entries WHERE id = ?').get(targetEntryId);
      
      if (!targetEntry || targetEntry.contest_id !== contest.id) {
        throw new Error('目标无效');
      }
      
      if (targetEntry.id === entry.id) {
        throw new Error('不能对自己使用干扰');
      }
      
      const targetBuffs = this.entryBuffs.get(targetEntryId) || [];
      targetBuffs.push({
        type: 'interference_pulse',
        multiplier: skill.effect.opponentDebuff,
        endTime: now + skill.duration * 1000
      });
      this.entryBuffs.set(targetEntryId, targetBuffs);
    }
    
    if (global.io) {
      global.io.to(`contest_${contest.id}`).emit('skill_used', {
        entryId: entry.id,
        playerId,
        skillType,
        targetEntryId,
        effect: skill.effect,
        duration: skill.duration,
        timestamp: now
      });
    }
    
    return {
      success: true,
      skill: skillType,
      duration: skill.duration,
      cooldown: skill.cooldown,
      targetAffected: !!targetEntry
    };
  }

  getSkillCooldown(entryId, skillType) {
    const key = `cooldown_${entryId}_${skillType}`;
    return this.skillCooldowns?.get?.(key) || 0;
  }

  setSkillCooldown(entryId, skillType, timestamp) {
    if (!this.skillCooldowns) {
      this.skillCooldowns = new Map();
    }
    const key = `cooldown_${entryId}_${skillType}`;
    this.skillCooldowns.set(key, timestamp);
  }

  getMatchedOpponents(playerId, contestId = null) {
    if (!contestId) {
      const today = new Date().toISOString().split('T')[0];
      const contest = this.db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
      if (!contest) return [];
      contestId = contest.id;
    }
    
    const playerEntry = this.db.prepare(`
      SELECT * FROM contest_entries 
      WHERE contest_id = ? AND player_id = ?
    `).get(contestId, playerId);
    
    if (!playerEntry) return [];
    
    const allEntries = this.db.prepare(`
      SELECT ce.*, p.nickname, p.avatar, d.name as detector_name, d.rarity, d.quality, d.range, d.precision
      FROM contest_entries ce
      JOIN players p ON ce.player_id = p.id
      JOIN detectors d ON ce.detector_id = d.id
      WHERE ce.contest_id = ? AND ce.id != ?
      ORDER BY ce.score DESC
      LIMIT 10
    `).all(contestId, playerEntry.id);
    
    return allEntries;
  }

  joinContest(playerId, detectorId, contestId = null) {
    if (!contestId) {
      const today = new Date().toISOString().split('T')[0];
      const contest = this.db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
      if (!contest) throw new Error('今日无比赛');
      contestId = contest.id;
    }

    const detector = this.db.prepare('SELECT * FROM detectors WHERE id = ? AND player_id = ?').get(detectorId, playerId);
    if (!detector) throw new Error('探测器不存在');

    const existingEntry = this.db.prepare(`
      SELECT * FROM contest_entries 
      WHERE contest_id = ? AND player_id = ?
    `).get(contestId, playerId);
    
    if (existingEntry) throw new Error('已参加今日比赛');

    const entryId = uuid();
    const soundWaveData = contestEngine.generateSoundWaveData(detector, 0);
    const baseScore = contestEngine.calculateBaseScore(detector, soundWaveData);

    this.db.prepare(`
      INSERT INTO contest_entries 
      (id, contest_id, player_id, detector_id, sound_wave_data, score, rarity_score, frequency_score, intensity_score, current_intensity, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      contestId,
      playerId,
      detectorId,
      JSON.stringify(soundWaveData),
      baseScore.total,
      baseScore.rarity,
      baseScore.frequency,
      baseScore.intensity,
      soundWaveData.intensity,
      Date.now()
    );

    this.db.prepare(`
      UPDATE contests 
      SET participant_count = participant_count + 1
      WHERE id = ?
    `).run(contestId);

    return { entryId, initialScore: baseScore.total };
  }

  getContestStandings(contestId) {
    const entries = this.db.prepare(`
      SELECT ce.*, p.nickname, p.avatar, d.name as detector_name, d.rarity, d.range, d.precision
      FROM contest_entries ce
      JOIN players p ON ce.player_id = p.id
      JOIN detectors d ON ce.detector_id = d.id
      WHERE ce.contest_id = ?
      ORDER BY ce.score DESC
      LIMIT 100
    `).all(contestId);

    return entries.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  }

  purchaseListing(listingId, buyerId) {
    const listing = this.db.prepare(`
      SELECT * FROM market_listings 
      WHERE id = ? AND status = 'active'
    `).get(listingId);
    
    if (!listing) throw new Error('商品不存在或已售出');
    if (listing.seller_id === buyerId) throw new Error('不能购买自己的商品');

    const buyer = this.db.prepare('SELECT * FROM players WHERE id = ?').get(buyerId);
    if (buyer.gold < listing.price) throw new Error('金币不足');

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE players SET gold = gold - ? WHERE id = ?
      `).run(listing.price, buyerId);

      this.db.prepare(`
        UPDATE players SET gold = gold + ? WHERE id = ?
      `).run(listing.price, listing.seller_id);

      this.db.prepare(`
        UPDATE market_listings 
        SET status = 'sold', sold_at = ?, buyer_id = ?
        WHERE id = ?
      `).run(Date.now(), buyerId, listingId);

      const transactionId = uuid();
      this.db.prepare(`
        INSERT INTO market_transactions 
        (id, listing_id, seller_id, buyer_id, item_type, price, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(transactionId, listingId, listing.seller_id, buyerId, listing.item_type, listing.price, Date.now());

      if (listing.item_type === 'detector') {
        this.db.prepare(`
          UPDATE detectors SET player_id = ?, is_tradable = 0 
          WHERE id = ?
        `).run(buyerId, listing.item_id);
      } else if (listing.item_type === 'material') {
        const itemData = JSON.parse(listing.item_data);
        const existing = this.db.prepare(`
          SELECT * FROM player_materials 
          WHERE player_id = ? AND material_id = ?
        `).get(buyerId, itemData.material_id);
        
        if (existing) {
          this.db.prepare(`
            UPDATE player_materials SET quantity = quantity + ?
            WHERE player_id = ? AND material_id = ?
          `).run(itemData.quantity, buyerId, itemData.material_id);
        } else {
          this.db.prepare(`
            INSERT INTO player_materials (id, player_id, material_id, quantity, quality)
            VALUES (?, ?, ?, ?, ?)
          `).run(uuid(), buyerId, itemData.material_id, itemData.quantity, itemData.quality || 50);
        }
      }
    });

    tx();

    if (global.io) {
      global.io.emit('market_sold', {
        listingId,
        itemType: listing.item_type,
        price: listing.price,
        sellerId: listing.seller_id,
        buyerId: buyerId
      });

      const recentTransactions = this.db.prepare(`
        SELECT COUNT(*) as count FROM market_transactions
        WHERE timestamp > ?
      `).get(Date.now() - 5 * 60 * 1000);

      if (recentTransactions.count >= 10 && Math.random() < 0.3) {
        const tide = triggerSoundTide('market_boom', 1800, 0.12);
        global.io.emit('sound_tide', tide);
      }
    }

    return { success: true, listingId };
  }

  getLeaderboard(type, limit = 50) {
    const cacheKey = `leaderboard_${type}`;
    
    return cacheGet(cacheKey).then(async cached => {
      if (cached) return cached;

      let data = [];

      switch (type) {
        case 'collection':
          data = this.db.prepare(`
            SELECT id, nickname, avatar, level, collection_score
            FROM players
            ORDER BY collection_score DESC
            LIMIT ?
          `).all(limit);
          break;
        case 'contest':
          data = this.db.prepare(`
            SELECT id, nickname, avatar, level, contest_points
            FROM players
            ORDER BY contest_points DESC
            LIMIT ?
          `).all(limit);
          break;
        case 'guild':
          data = this.db.prepare(`
            SELECT g.id, g.name, g.level, g.workshop_count,
                   COUNT(gm.id) as member_count,
                   SUM(gm.contribution) as total_contribution
            FROM guilds g
            LEFT JOIN guild_members gm ON g.id = gm.guild_id
            GROUP BY g.id
            ORDER BY total_contribution DESC
            LIMIT ?
          `).all(limit);
          break;
        default:
          data = this.db.prepare(`
            SELECT id, nickname, avatar, level, collection_score
            FROM players
            ORDER BY collection_score DESC
            LIMIT ?
          `).all(limit);
      }

      await cacheSet(cacheKey, data, 60);
      return data;
    });
  }

  generateIndustryReport(weekNumber, year) {
    const report = {
      weekNumber,
      year,
      generatedAt: Date.now(),
      summary: {},
      materialUsage: {},
      contestStats: {},
      marketStats: {},
      priceTrends: {}
    };

    const weekStart = getWeekStartDate(weekNumber, year);
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

    const craftingCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM crafting_tasks
      WHERE start_time >= ? AND start_time < ? AND status = 'completed'
    `).get(weekStart, weekEnd).count;

    const detectorCount = this.db.prepare(`
      SELECT COUNT(*) as count, rarity
      FROM detectors
      WHERE created_at >= ? AND created_at < ?
      GROUP BY rarity
    `).all(weekStart, weekEnd);

    report.summary.totalCrafting = craftingCount;
    report.summary.detectorsByRarity = detectorCount;

    const materialUsage = this.db.prepare(`
      SELECT material_id, SUM(quantity) as total_used
      FROM (
        SELECT JSON_EACH.value as material_data
        FROM crafting_tasks,
             JSON_EACH(materials)
        WHERE start_time >= ? AND start_time < ?
      )
      GROUP BY JSON_EXTRACT(material_data, '$.material_id')
    `).all(weekStart, weekEnd);

    report.materialUsage = materialUsage;

    const contestEntries = this.db.prepare(`
      SELECT COUNT(*) as count, AVG(score) as avg_score
      FROM contest_entries ce
      JOIN contests c ON ce.contest_id = c.id
      WHERE c.date >= ? AND c.date < ?
    `).get(weekStart, weekEnd);

    report.contestStats = contestEntries;

    const transactionCount = this.db.prepare(`
      SELECT COUNT(*) as count, SUM(price) as total_volume
      FROM market_transactions
      WHERE timestamp >= ? AND timestamp < ?
    `).get(weekStart, weekEnd);

    report.marketStats = transactionCount;

    const materials = this.db.prepare('SELECT * FROM materials').all();
    report.priceTrends = {};
    materials.forEach(m => {
      const prices = this.db.prepare(`
        SELECT AVG(price) as avg_price, 
               strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch')) as day
        FROM market_transactions
        WHERE item_type = 'material'
        AND JSON_EXTRACT(item_data, '$.material_id') = ?
        AND timestamp >= ? AND timestamp < ?
        GROUP BY day
        ORDER BY day
      `).all(m.id, weekStart, weekEnd);
      
      if (prices.length > 0) {
        report.priceTrends[m.id] = {
          name: m.name,
          data: prices
        };
      }
    });

    const reportId = uuid();
    this.db.prepare(`
      INSERT INTO industry_reports (id, week_number, year, report_data, generated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(reportId, weekNumber, year, JSON.stringify(report), Date.now());

    return { reportId, ...report };
  }
}

function generateNickname() {
  const prefixes = ['精致的', '华丽的', '神秘的', '远古的', '闪耀的', '深沉的', '灵动的'];
  const suffixes = ['回声', '共鸣', '穿透', '深视', '和谐', '时曲'];
  return prefixes[Math.floor(Math.random() * prefixes.length)] + 
         suffixes[Math.floor(Math.random() * suffixes.length)];
}

function getWeekStartDate(weekNumber, year) {
  const firstDay = new Date(year, 0, 1);
  const dayOfWeek = firstDay.getDay();
  const diff = (weekNumber - 1) * 7 - dayOfWeek + 1;
  return new Date(year, 0, 1 + diff).getTime();
}

module.exports = { GameEngine };
