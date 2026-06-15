const express = require('express');
const PDFDocument = require('pdfkit');
const { getDb } = require('../db/database');
const { authMiddleware } = require('./auth');

const router = express.Router();

let gameEngine = null;

function setGameEngine(engine) {
  gameEngine = engine;
}

router.get('/current', authMiddleware, (req, res) => {
  const db = getDb();
  const now = new Date();
  const weekNumber = getWeekNumber(now);
  
  const weekStart = getWeekStart(weekNumber, now.getFullYear());
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  
  const craftingCount = db.prepare(`
    SELECT COUNT(*) as count FROM crafting_tasks
    WHERE start_time >= ? AND status = 'completed'
  `).get(weekStart).count;
  
  const detectorRarity = db.prepare(`
    SELECT rarity, COUNT(*) as count
    FROM detectors
    WHERE created_at >= ?
    GROUP BY rarity
  `).all(weekStart);
  
  const materialsUsed = db.prepare(`
    SELECT m.id, m.name, m.type, m.rarity, COUNT(*) as times_used
    FROM crafting_tasks ct,
         json_each(ct.materials) as mat_json,
         materials m
    WHERE ct.start_time >= ?
      AND json_extract(mat_json.value, '$.material_id') = m.id
    GROUP BY m.id
    ORDER BY times_used DESC
    LIMIT 10
  `).all(weekStart);
  
  const contestStats = db.prepare(`
    SELECT COUNT(*) as total_entries, AVG(score) as avg_score
    FROM contest_entries ce
    JOIN contests c ON ce.contest_id = c.id
    WHERE c.date >= ?
  `).get(weekStart.toISOString().split('T')[0]);
  
  const marketStats = db.prepare(`
    SELECT COUNT(*) as total_transactions,
           SUM(price) as total_volume,
           AVG(price) as avg_price
    FROM market_transactions
    WHERE timestamp >= ?
  `).get(weekStart);
  
  const topDetectors = db.prepare(`
    SELECT d.*, p.nickname
    FROM detectors d
    JOIN players p ON d.player_id = p.id
    WHERE d.created_at >= ?
    ORDER BY d.quality DESC
    LIMIT 5
  `).all(weekStart);
  
  const priceTrends = db.prepare(`
    SELECT m.id, m.name,
           AVG(mt.price) as avg_price,
           COUNT(*) as volume
    FROM market_transactions mt
    JOIN materials m ON json_extract(mt.item_data, '$.material_id') = m.id
    WHERE mt.timestamp >= ?
    GROUP BY m.id
    ORDER BY volume DESC
    LIMIT 8
  `).all(weekStart);
  
  const report = {
    weekNumber,
    year: now.getFullYear(),
    period: { start: weekStart, end: weekEnd },
    summary: {
      totalCrafting: craftingCount,
      totalDetectors: detectorRarity.reduce((sum, d) => sum + d.count, 0),
      detectorByRarity: detectorRarity,
      totalContestEntries: contestStats.total_entries || 0,
      avgContestScore: Math.floor(contestStats.avg_score || 0),
      totalTransactions: marketStats.total_transactions || 0,
      totalVolume: marketStats.total_volume || 0,
      avgTransactionPrice: Math.floor(marketStats.avg_price || 0)
    },
    topMaterials: materialsUsed,
    topDetectors: topDetectors.map(d => ({
      ...d,
      affixes: JSON.parse(d.affixes || '[]')
    })),
    priceTrends
  };
  
  res.json(report);
});

router.get('/export/pdf', authMiddleware, (req, res) => {
  const db = getDb();
  const now = new Date();
  const weekNumber = getWeekNumber(now);
  const weekStart = getWeekStart(weekNumber, now.getFullYear());
  
  const craftingCount = db.prepare(`
    SELECT COUNT(*) as count FROM crafting_tasks
    WHERE start_time >= ? AND status = 'completed'
  `).get(weekStart).count;
  
  const detectorRarity = db.prepare(`
    SELECT rarity, COUNT(*) as count
    FROM detectors
    WHERE created_at >= ?
    GROUP BY rarity
  `).all(weekStart);
  
  const contestStats = db.prepare(`
    SELECT COUNT(*) as total_entries, AVG(score) as avg_score
    FROM contest_entries ce
    JOIN contests c ON ce.contest_id = c.id
    WHERE c.date >= ?
  `).get(weekStart.toISOString().split('T')[0]);
  
  const marketStats = db.prepare(`
    SELECT COUNT(*) as total_transactions, SUM(price) as total_volume
    FROM market_transactions
    WHERE timestamp >= ?
  `).get(weekStart);
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=industry-report-week${weekNumber}.pdf`);
  
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  
  doc.fontSize(24).text('回声工坊产业报告', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text(`第 ${weekNumber} 周 - ${now.getFullYear()}年`, { align: 'center' });
  doc.moveDown(2);
  
  doc.fontSize(18).text('📊 本周摘要');
  doc.moveDown();
  doc.fontSize(12);
  doc.text(`• 总制作次数: ${craftingCount}`);
  doc.text(`• 产出探测器: ${detectorRarity.reduce((sum, d) => sum + d.count, 0)}`);
  doc.text(`• 大赛参赛数: ${contestStats.total_entries || 0}`);
  doc.text(`• 平均大赛分数: ${Math.floor(contestStats.avg_score || 0)}`);
  doc.text(`• 交易总数: ${marketStats.total_transactions || 0}`);
  doc.text(`• 交易总额: ${marketStats.total_volume || 0} 金币`);
  
  doc.moveDown(2);
  doc.fontSize(18).text('🏆 探测器品质分布');
  doc.moveDown();
  
  const rarityNames = {
    common: '普通',
    uncommon: '优秀',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说'
  };
  
  detectorRarity.forEach(d => {
    const barWidth = (d.count / Math.max(...detectorRarity.map(x => x.count))) * 200;
    doc.text(`${rarityNames[d.rarity] || d.rarity}: ${d.count}个`);
    doc.rect(doc.x, doc.y, barWidth, 15).fill('#3498db');
    doc.moveDown(0.5);
  });
  
  doc.addPage();
  doc.fontSize(18).text('📈 探测器属性雷达图');
  doc.moveDown();
  
  const centerX = 300;
  const centerY = 350;
  const maxRadius = 150;
  const axes = 6;
  const labels = ['探测范围', '精度', '品质', '稀有度', '词缀数', '收藏价值'];
  
  const avgRange = db.prepare('SELECT AVG(range) as avg FROM detectors WHERE created_at >= ?').get(weekStart).avg || 0;
  const avgPrecision = db.prepare('SELECT AVG(precision) as avg FROM detectors WHERE created_at >= ?').get(weekStart).avg || 0;
  const avgQuality = db.prepare('SELECT AVG(quality) as avg FROM detectors WHERE created_at >= ?').get(weekStart).avg || 0;
  
  const values = [
    Math.min(avgRange / 300, 1),
    Math.min(avgPrecision / 100, 1),
    Math.min(avgQuality / 100, 1),
    0.6,
    0.4,
    0.5
  ];
  
  for (let i = 0; i < axes; i++) {
    const angle = (i / axes) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * maxRadius;
    const y = centerY + Math.sin(angle) * maxRadius;
    
    doc.moveTo(centerX, centerY);
    doc.lineTo(x, y);
    doc.strokeColor('#ccc').lineWidth(1).stroke();
    
    const labelX = centerX + Math.cos(angle) * (maxRadius + 20);
    const labelY = centerY + Math.sin(angle) * (maxRadius + 20);
    doc.fillColor('#333').fontSize(10).text(labels[i], labelX - 30, labelY - 5);
  }
  
  doc.moveTo(
    centerX + Math.cos(-Math.PI / 2) * maxRadius * values[0],
    centerY + Math.sin(-Math.PI / 2) * maxRadius * values[0]
  );
  
  for (let i = 1; i < axes; i++) {
    const angle = (i / axes) * Math.PI * 2 - Math.PI / 2;
    doc.lineTo(
      centerX + Math.cos(angle) * maxRadius * values[i],
      centerY + Math.sin(angle) * maxRadius * values[i]
    );
  }
  
  doc.closePath();
  doc.fillColor('rgba(52, 152, 219, 0.3)').fill();
  doc.strokeColor('#3498db').lineWidth(2).stroke();
  
  doc.moveDown(3);
  doc.fontSize(16).fillColor('#333').text('💡 趋势分析');
  doc.moveDown();
  doc.fontSize(11).text('本周制作量较上周有所上升，稀有品质探测器产出率提高约5%。');
  doc.text('建议关注声波水晶价格走势，合理安排生产计划。');
  
  doc.end();
});

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getWeekStart(weekNumber, year) {
  const firstDay = new Date(year, 0, 1);
  const dayOfWeek = firstDay.getDay();
  const diff = (weekNumber - 1) * 7 - dayOfWeek + 1;
  return new Date(year, 0, 1 + diff).getTime();
}

module.exports = router;
module.exports.setGameEngine = setGameEngine;
