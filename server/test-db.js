const { initDatabase, getDb } = require('./src/db/database');

const db = initDatabase();
const qb = getDb();

console.log('=== 测试1: 简单查询（单个参数）===');
const player = qb.prepare('SELECT * FROM players WHERE id = ?').get('f919f57f-9840-4a8b-b0fd-440edc707559');
console.log('用户1:', player ? player.nickname : 'NOT FOUND');

console.log('\n=== 测试2: 多参数 WHERE 查询 ===');
const detector = qb.prepare('SELECT * FROM detectors WHERE id = ? AND player_id = ?').get(
  '61a0a020-d9ae-438a-a65e-e79c5fe98428',
  'f919f57f-9840-4a8b-b0fd-440edc707559'
);
console.log('用户1探测器:', detector ? detector.name : 'NOT FOUND');
console.log('探测器详情:', detector ? JSON.stringify(detector) : 'null');

console.log('\n=== 测试3: JOIN 查询 ===');
const entries = qb.prepare(`
  SELECT ce.*, p.nickname, d.name as detector_name
  FROM contest_entries ce
  JOIN players p ON ce.player_id = p.id
  JOIN detectors d ON ce.detector_id = d.id
  WHERE ce.contest_id = ?
  ORDER BY ce.score DESC
`).all('dfa888b3-7cd6-47b2-ac23-b2ef9364c828');
console.log('参赛记录数量:', entries.length);
entries.forEach(e => {
  console.log(`  ${e.nickname}: score=${e.score}, intensity=${e.intensity}, detector=${e.detector_name}`);
});

console.log('\n=== 测试4: 带表前缀的 WHERE 查询 ===');
const materials = qb.prepare(`
  SELECT pm.*, m.name
  FROM player_materials pm
  JOIN materials m ON pm.material_id = m.id
  WHERE pm.player_id = ? AND pm.quantity > 0
`).all('f919f57f-9840-4a8b-b0fd-440edc707559');
console.log('用户1材料数量:', materials.length);
materials.forEach(m => {
  console.log(`  ${m.name}: ${m.quantity}`);
});
