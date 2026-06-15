const path = require('path');
const { initDatabase, getDb, _query } = require('./server/src/db/database.js');

async function test() {
  await initDatabase();
  const db = getDb();
  
  console.log('=== 测试 1: 简单 UPDATE SET 表达式 ===');
  console.log('测试前 player_materials 中材料数量:');
  const before = db.prepare('SELECT material_id, quantity FROM player_materials WHERE player_id = ? AND material_id IN (?, ?, ?)').all('18d38fb2-b193-41d0-920c-be1250a37737', 'mat_crystal_common', 'mat_resonator_wood', 'mat_core_basic');
  console.log(JSON.stringify(before, null, 2));
  
  console.log('\n执行: UPDATE player_materials SET quantity = quantity - 1 WHERE player_id = ? AND material_id = ?');
  const result = db.prepare('UPDATE player_materials SET quantity = quantity - ? WHERE player_id = ? AND material_id = ?').run(1, '18d38fb2-b193-41d0-920c-be1250a37737', 'mat_core_basic');
  console.log('更新结果:', result);
  
  console.log('\n测试后数量:');
  const after = db.prepare('SELECT material_id, quantity FROM player_materials WHERE player_id = ? AND material_id = ?').all('18d38fb2-b193-41d0-920c-be1250a37737', 'mat_core_basic');
  console.log(JSON.stringify(after, null, 2));
  
  process.exit(0);
}

test();
