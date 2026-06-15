const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data/echo-workshop.json');
console.log('数据库路径:', dbPath);

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 设置大赛为 active
const today = new Date().toISOString().split('T')[0];
db.contests[0].date = today;
db.contests[0].status = 'active';
db.contests[0].start_time = Date.now() - 3600000;
db.contests[0].end_time = Date.now() + 3600000;
console.log('大赛已更新:', db.contests[0].id, db.contests[0].status, 'date:', db.contests[0].date);

// 查找用户2（对手玩家）
const player2 = db.players.find(p => p.username === 'testuser5');
console.log('用户2:', player2?.id, player2?.nickname);

// 创建一个探测器给用户2
const detector2 = {
  id: 'det-opponent-' + Date.now(),
  player_id: player2.id,
  workshop_id: player2.workshop_id,
  name: '基础回声探测器 对手专用',
  recipe_id: 'recipe_basic_echolocator',
  tier: 1,
  range: 25,
  precision: 12,
  rarity: 'common',
  affixes: '[]',
  hidden_attributes: '[]',
  quality: 18,
  created_at: Date.now()
};
db.detectors.push(detector2);
console.log('已创建对手探测器:', detector2.id);

// 清除旧的参赛记录
db.contest_entries = [];

// 添加用户2的参赛记录
const entry2 = {
  id: 'entry-opponent-' + Date.now(),
  contest_id: db.contests[0].id,
  player_id: player2.id,
  detector_id: detector2.id,
  base_intensity: 180,
  intensity: 180,
  score: 50,
  final_score: 0,
  rank: 2,
  joined_at: Date.now()
};
db.contest_entries.push(entry2);
console.log('对手参赛记录已添加:', entry2.id, '强度:', entry2.intensity, '分数:', entry2.score);

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('数据库保存完成');
console.log('验证:');
const verify = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
console.log('  大赛状态:', verify.contests[0].status);
console.log('  参赛记录数:', verify.contest_entries.length);
console.log('  对手记录:', verify.contest_entries[0]?.player_id, verify.contest_entries[0]?.score);
