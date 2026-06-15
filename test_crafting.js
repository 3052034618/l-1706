const fs = require('fs');
const path = require('path');
const { initDatabase, getDb } = require('./server/src/db/database.js');
const { GameEngine } = require('./server/src/engine/GameEngine.js');

async function test() {
  const dataFilePath = path.join(__dirname, 'server', 'data', 'echo-workshop.json');
  
  // 删除现有数据库，初始化干净数据
  if (fs.existsSync(dataFilePath)) {
    fs.unlinkSync(dataFilePath);
    console.log('🗑️  已删除旧数据库');
  }
  
  await initDatabase();
  const db = getDb();
  
  // 注册测试玩家
  const testPlayerId = db.players[0]?.id;
  console.log('测试玩家:', testPlayerId);
  
  console.log('\n=== 初始材料数量 ===');
  const before = db.prepare(`
    SELECT pm.material_id, m.name, pm.quantity 
    FROM player_materials pm 
    JOIN materials m ON pm.material_id = m.id
    WHERE pm.player_id = ?
  `).all(testPlayerId);
  before.forEach(m => console.log(`  ${m.material_id} (${m.name}): ${m.quantity}`));
  
  // 创建游戏引擎
  const engine = new GameEngine();
  await engine.init();
  
  const recipeId = 'recipe_basic_echolocator';
  const echosmithId = db.echosmiths[0]?.id;
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
  const recipeMaterials = JSON.parse(recipe.materials);
  
  console.log(`\n📋 配方: ${recipe.name}`);
  recipeMaterials.forEach(m => console.log(`  需要: ${m.material_id} x ${m.quantity}`));
  
  // 前端传来的材料顺序
  const frontendMaterials = recipeMaterials.map(m => ({
    material_id: m.material_id,
    quantity: m.quantity
  }));
  
  console.log('\n🚀 开始制作...');
  try {
    const result = engine.startCrafting(testPlayerId, recipeId, echosmithId, frontendMaterials);
    console.log('✅ 制作任务创建:', result.taskId.substring(0, 8));
  } catch (e) {
    console.log('❌ 制作失败:', e.message);
  }
  
  console.log('\n=== 扣除后材料数量 ===');
  const after = db.prepare(`
    SELECT pm.material_id, m.name, pm.quantity 
    FROM player_materials pm 
    JOIN materials m ON pm.material_id = m.id
    WHERE pm.player_id = ?
  `).all(testPlayerId);
  after.forEach(m => console.log(`  ${m.material_id} (${m.name}): ${m.quantity}`));
  
  console.log('\n=== 差异分析 ===');
  const beforeMap = {};
  before.forEach(m => beforeMap[m.material_id] = m.quantity);
  after.forEach(m => {
    const diff = (beforeMap[m.material_id] || 0) - m.quantity;
    const expected = recipeMaterials.find(r => r.material_id === m.material_id)?.quantity || 0;
    const ok = diff === expected ? '✅' : '❌';
    console.log(`  ${ok} ${m.material_id}: 扣了 ${diff}, 应该扣 ${expected}`);
  });
  
  process.exit(0);
}

test();
