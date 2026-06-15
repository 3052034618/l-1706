const cron = require('node-cron');
const { getDb } = require('./db/database');
const { cacheSet, cacheDel } = require('./db/redis');

function initScheduler(gameEngine) {
  cron.schedule('0 10 * * *', () => {
    console.log('🕐 每日大赛开始');
    startDailyContest(gameEngine);
  });

  cron.schedule('0 22 * * *', () => {
    console.log('🕐 每日大赛结束');
    endDailyContest(gameEngine);
  });

  cron.schedule('0 */5 * * * *', () => {
    updateContestScores(gameEngine);
  });

  cron.schedule('0 * * * *', () => {
    refreshLeaderboards(gameEngine);
  });

  cron.schedule('0 0 * * 1', () => {
    console.log('📊 生成周度产业报告');
    generateWeeklyReport(gameEngine);
  });

  setInterval(() => {
    checkSoundTideExpiry(gameEngine);
  }, 60000);

  console.log('✅ 定时任务已启动');
}

function startDailyContest(gameEngine) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  let contest = db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
  
  if (!contest) {
    const contestId = require('uuid').v4();
    const themes = ['深海回音', '森林细语', '风暴之声', '远古回响', '星辰之音', '熔岩低鸣', '冰川裂隙'];
    const theme = themes[Math.floor(Math.random() * themes.length)];
    
    db.prepare(`
      INSERT INTO contests (id, date, status, start_time, end_time, theme, participant_count)
      VALUES (?, ?, 'active', ?, ?, ?, 0)
    `).run(contestId, today, Date.now(), Date.now() + 12 * 60 * 60 * 1000, theme);
    
    contest = db.prepare('SELECT * FROM contests WHERE id = ?').get(contestId);
  } else {
    db.prepare("UPDATE contests SET status = 'active' WHERE id = ?").run(contest.id);
  }
  
  if (global.io) {
    global.io.emit('contest_started', { contest });
  }
  
  console.log(`🏆 今日大赛开始: ${contest.theme}`);
}

function endDailyContest(gameEngine) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  const contest = db.prepare('SELECT * FROM contests WHERE date = ?').get(today);
  
  if (!contest) return;
  
  db.prepare("UPDATE contests SET status = 'ended' WHERE id = ?").run(contest.id);
  
  const entries = db.prepare(`
    SELECT * FROM contest_entries 
    WHERE contest_id = ?
    ORDER BY score DESC
  `).all(contest.id);
  
  entries.forEach((entry, index) => {
    const rank = index + 1;
    
    db.prepare(`
      UPDATE contest_entries SET rank = ? WHERE id = ?
    `).run(rank, entry.id);
    
    let points = 0;
    let gold = 0;
    
    if (rank <= Math.ceil(entries.length * 0.01)) {
      points = 500;
      gold = 2000;
    } else if (rank <= Math.ceil(entries.length * 0.05)) {
      points = 300;
      gold = 1000;
    } else if (rank <= Math.ceil(entries.length * 0.1)) {
      points = 150;
      gold = 500;
    } else if (rank <= Math.ceil(entries.length * 0.25)) {
      points = 80;
      gold = 200;
    } else if (rank <= Math.ceil(entries.length * 0.5)) {
      points = 40;
      gold = 100;
    } else {
      points = 10;
      gold = 20;
    }
    
    db.prepare(`
      UPDATE players 
      SET contest_points = contest_points + ?,
          gold = gold + ?
      WHERE id = ?
    `).run(points, gold, entry.player_id);
    
    if (global.io) {
      global.io.to(`player_${entry.player_id}`).emit('contest_result', {
        contestId: contest.id,
        rank,
        points,
        gold,
        score: entry.score
      });
    }
  });
  
  if (global.io) {
    global.io.emit('contest_ended', {
      contest,
      topPlayers: entries.slice(0, 10).map((e, i) => ({
        rank: i + 1,
        playerId: e.player_id,
        score: e.score
      }))
    });
  }
  
  cacheDel('leaderboard_contest');
  
  console.log(`🏆 今日大赛结束, 共 ${entries.length} 人参赛`);
}

function updateContestScores(gameEngine) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  const contest = db.prepare(`
    SELECT * FROM contests WHERE date = ? AND status = 'active'
  `).get(today);
  
  if (!contest) return;
  
  const entries = db.prepare(`
    SELECT ce.*, d.range, d.precision, d.rarity, d.affixes
    FROM contest_entries ce
    JOIN detectors d ON ce.detector_id = d.id
    WHERE ce.contest_id = ? AND ce.is_active = 1
  `).all(contest.id);
  
  const elapsedTime = (Date.now() - contest.start_time) / 1000;
  
  entries.forEach(entry => {
    const detector = {
      range: entry.range,
      precision: entry.precision,
      rarity: entry.rarity,
      affixes: JSON.parse(entry.affixes || '[]')
    };
    
    const waveData = generateSoundWaveData(detector, elapsedTime);
    const scoreIncrease = Math.floor(waveData.intensity * 0.1);
    const newScore = entry.score + scoreIncrease;
    
    db.prepare(`
      UPDATE contest_entries 
      SET score = ?, 
          current_intensity = ?,
          sound_wave_data = ?
      WHERE id = ?
    `).run(newScore, waveData.intensity, JSON.stringify(waveData), entry.id);
    
    if (global.io) {
      global.io.to(`contest_${contest.id}`).emit('score_update', {
        entryId: entry.id,
        score: newScore,
        intensity: waveData.intensity,
        wavePattern: waveData.wavePattern
      });
    }
  });
  
  console.log(`📊 更新大赛分数, 共 ${entries.length} 名参赛者`);
}

function generateSoundWaveData(detector, timeElapsed) {
  const baseIntensity = detector.range * 0.5 + detector.precision * 0.3;
  const waveVariation = Math.sin(timeElapsed * 0.1) * 0.2 + 1;
  const decayFactor = Math.max(0.5, 1 - (timeElapsed / 120) * 0.3);
  const noise = (Math.random() - 0.5) * 0.1;
  
  const currentIntensity = baseIntensity * waveVariation * decayFactor * (1 + noise);
  const frequency = 50 + detector.precision * 0.5 + Math.sin(timeElapsed * 0.05) * 10;
  
  const pattern = [];
  for (let i = 0; i < 10; i++) {
    const t = timeElapsed + i * 0.1;
    pattern.push({
      time: i,
      amplitude: (Math.sin(t * 0.1) * 0.5 + 0.5).toFixed(2),
      freq: (50 + detector.precision * 0.5 + Math.sin(t * 0.05) * 20).toFixed(0)
    });
  }
  
  return {
    intensity: Math.floor(currentIntensity),
    frequency: Math.floor(frequency),
    wavePattern: pattern
  };
}

async function refreshLeaderboards(gameEngine) {
  try {
    const types = ['collection', 'contest', 'guild'];
    for (const type of types) {
      await gameEngine.getLeaderboard(type);
    }
  } catch (e) {
    console.error('刷新排行榜失败:', e);
  }
}

function generateWeeklyReport(gameEngine) {
  const now = new Date();
  const weekNumber = getWeekNumber(now);
  
  if (gameEngine) {
    gameEngine.generateIndustryReport(weekNumber, now.getFullYear());
  }
}

function checkSoundTideExpiry(gameEngine) {
  const db = getDb();
  
  db.prepare(`
    UPDATE sound_tide_events 
    SET active = 0
    WHERE active = 1 AND (event_time + duration * 1000) < ?
  `).run(Date.now());
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

module.exports = { initScheduler };
