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
  
  const dailyPriceData = getDailyPriceData(db, weekStart);
  
  const radarData = calculateRadarData(db, weekStart);
  
  const contestScoreHistory = getContestScoreHistory(db, weekStart);
  
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
    priceTrends,
    dailyPriceData,
    radarData,
    contestScoreHistory
  };
  
  res.json(report);
});

function getDailyPriceData(db, weekStart) {
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const dailyData = {};
  
  for (let i = 0; i < 7; i++) {
    const dayStart = weekStart + i * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    
    const topMaterials = db.prepare(`
      SELECT m.id, m.name
      FROM market_transactions mt
      JOIN materials m ON json_extract(mt.item_data, '$.material_id') = m.id
      WHERE mt.timestamp >= ?
      GROUP BY m.id
      ORDER BY COUNT(*) DESC
      LIMIT 5
    `).all(weekStart);
    
    for (const mat of topMaterials) {
      if (!dailyData[mat.name]) {
        dailyData[mat.name] = [];
      }
      
      const avgPrice = db.prepare(`
        SELECT AVG(price) as avg_price
        FROM market_transactions mt
        WHERE json_extract(mt.item_data, '$.material_id') = ?
          AND mt.timestamp >= ? AND mt.timestamp < ?
      `).get(mat.id, dayStart, dayEnd).avg_price;
      
      dailyData[mat.name].push(avgPrice ? Math.floor(avgPrice) : 0);
    }
  }
  
  const labels = days;
  const datasets = Object.entries(dailyData).map(([name, prices], index) => {
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'];
    return {
      name,
      data: prices,
      color: colors[index % colors.length]
    };
  });
  
  return { labels, datasets };
}

function calculateRadarData(db, weekStart) {
  const stats = db.prepare(`
    SELECT 
      AVG(range) as avg_range,
      AVG(precision) as avg_precision,
      AVG(quality) as avg_quality,
      AVG(affix_count) as avg_affixes,
      AVG(market_value) as avg_value
    FROM detectors
    WHERE created_at >= ?
  `).get(weekStart);
  
  const rarityScore = db.prepare(`
    SELECT 
      SUM(CASE WHEN rarity = 'legendary' THEN 100
               WHEN rarity = 'epic' THEN 80
               WHEN rarity = 'rare' THEN 60
               WHEN rarity = 'uncommon' THEN 40
               ELSE 20 END) / COUNT(*) as rarity_score
    FROM detectors
    WHERE created_at >= ?
  `).get(weekStart).rarity_score || 0;
  
  const maxRange = 300;
  const maxPrecision = 100;
  const maxQuality = 100;
  const maxAffixes = 5;
  const maxValue = 5000;
  
  return {
    labels: ['探测范围', '精度', '品质', '稀有度', '词缀数', '收藏价值'],
    values: [
      Math.min(Math.floor((stats.avg_range || 0) / maxRange * 100), 100),
      Math.min(Math.floor((stats.avg_precision || 0) / maxPrecision * 100), 100),
      Math.min(Math.floor((stats.avg_quality || 0) / maxQuality * 100), 100),
      Math.min(rarityScore, 100),
      Math.min(Math.floor((stats.avg_affixes || 0) / maxAffixes * 100), 100),
      Math.min(Math.floor((stats.avg_value || 0) / maxValue * 100), 100)
    ]
  };
}

function getContestScoreHistory(db, weekStart) {
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const scores = [];
  const entries = [];
  
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart + i * 24 * 60 * 60 * 1000);
    const dateStr = dayDate.toISOString().split('T')[0];
    
    const dayStats = db.prepare(`
      SELECT AVG(score) as avg_score, COUNT(*) as entry_count
      FROM contest_entries ce
      JOIN contests c ON ce.contest_id = c.id
      WHERE c.date = ?
    `).get(dateStr);
    
    scores.push(Math.floor(dayStats.avg_score || 0));
    entries.push(dayStats.entry_count || 0);
  }
  
  return {
    labels: days,
    scores,
    entries
  };
}

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
  
  const topDetectors = db.prepare(`
    SELECT d.*, p.nickname
    FROM detectors d
    JOIN players p ON d.player_id = p.id
    WHERE d.created_at >= ?
    ORDER BY d.quality DESC
    LIMIT 5
  `).all(weekStart);
  
  const radarData = calculateRadarData(db, weekStart);
  const contestScoreHistory = getContestScoreHistory(db, weekStart);
  const dailyPriceData = getDailyPriceData(db, weekStart);
  
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
  
  const maxCount = Math.max(...detectorRarity.map(x => x.count), 1);
  detectorRarity.forEach(d => {
    const barWidth = (d.count / maxCount) * 200;
    doc.text(`${rarityNames[d.rarity] || d.rarity}: ${d.count}个`);
    doc.rect(doc.x, doc.y, barWidth, 15).fill('#3498db');
    doc.moveDown(0.8);
  });
  
  doc.addPage();
  doc.fontSize(18).text('� 探测器属性雷达图');
  doc.moveDown();
  
  const centerX = 300;
  const centerY = 320;
  const maxRadius = 130;
  const axes = 6;
  const labels = radarData.labels;
  const values = radarData.values;
  
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
  
  for (let ring = 1; ring <= 5; ring++) {
    const ringRadius = (ring / 5) * maxRadius;
    doc.ellipse(centerX, centerY, ringRadius, ringRadius);
    doc.strokeColor('#eee').lineWidth(0.5).stroke();
  }
  
  const firstAngle = -Math.PI / 2;
  doc.moveTo(
    centerX + Math.cos(firstAngle) * maxRadius * (values[0] / 100),
    centerY + Math.sin(firstAngle) * maxRadius * (values[0] / 100)
  );
  
  for (let i = 1; i < axes; i++) {
    const angle = (i / axes) * Math.PI * 2 - Math.PI / 2;
    doc.lineTo(
      centerX + Math.cos(angle) * maxRadius * (values[i] / 100),
      centerY + Math.sin(angle) * maxRadius * (values[i] / 100)
    );
  }
  
  doc.closePath();
  doc.fillColor('rgba(52, 152, 219, 0.3)').fill();
  doc.strokeColor('#3498db').lineWidth(2).stroke();
  
  doc.moveDown(3);
  doc.fontSize(12).fillColor('#333');
  labels.forEach((label, i) => {
    doc.text(`• ${label}: ${values[i]}分`);
  });
  
  doc.addPage();
  doc.fontSize(18).text('📈 大赛评分曲线');
  doc.moveDown();
  
  const maxScore = Math.max(...contestScoreHistory.scores, 1);
  const chartX = 60;
  const chartY = 120;
  const chartWidth = 480;
  const chartHeight = 180;
  
  doc.rect(chartX, chartY, chartWidth, chartHeight).strokeColor('#eee').stroke();
  
  for (let i = 0; i <= 5; i++) {
    const y = chartY + (i / 5) * chartHeight;
    doc.moveTo(chartX, y);
    doc.lineTo(chartX + chartWidth, y);
    doc.strokeColor('#f5f5f5').stroke();
    doc.fontSize(8).fillColor('#999').text(
      Math.floor(maxScore * (1 - i / 5)).toString(),
      chartX - 35, y - 4
    );
  }
  
  const points = contestScoreHistory.scores.map((score, i) => ({
    x: chartX + (i / 6) * chartWidth,
    y: chartY + chartHeight - (score / maxScore) * chartHeight
  }));
  
  if (points.length > 1) {
    doc.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      doc.lineTo(points[i].x, points[i].y);
    }
    doc.strokeColor('#667eea').lineWidth(2).stroke();
    
    points.forEach(point => {
      doc.circle(point.x, point.y, 4).fillColor('#667eea').fill();
    });
  }
  
  contestScoreHistory.labels.forEach((label, i) => {
    doc.fontSize(9).fillColor('#666').text(
      label,
      chartX + (i / 6) * chartWidth - 12,
      chartY + chartHeight + 10
    );
  });
  
  doc.moveDown(12);
  doc.fontSize(18).text('💹 价格走势');
  doc.moveDown();
  
  dailyPriceData.datasets.forEach(dataset => {
    doc.fontSize(11).fillColor(dataset.color);
    doc.text(`• ${dataset.name}: 平均约 ${Math.floor(dataset.data.reduce((a, b) => a + b, 0) / 7)} 金币`);
  });
  
  doc.addPage();
  doc.fontSize(18).text('🏆 本周最佳探测器');
  doc.moveDown();
  
  topDetectors.forEach((detector, index) => {
    doc.fontSize(12).fillColor('#333');
    doc.text(`#${index + 1} ${detector.name}`);
    doc.fontSize(10).fillColor('#666');
    doc.text(`   拥有者: ${detector.nickname}`);
    doc.text(`   品质: ${detector.quality} | 范围: ${detector.range} | 精度: ${detector.precision}`);
    doc.moveDown(0.5);
  });
  
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#333').text('💡 趋势分析');
  doc.moveDown();
  doc.fontSize(11).fillColor('#555');
  
  if (craftingCount > 0) {
    doc.text(`• 本周共完成 ${craftingCount} 次制作，产出 ${detectorRarity.reduce((sum, d) => sum + d.count, 0)} 个探测器`);
  } else {
    doc.text('• 本周暂无制作记录，制作后即可查看详细统计');
  }
  
  if (contestStats.total_entries > 0) {
    doc.text(`• 回声大赛共有 ${contestStats.total_entries} 人次参赛，平均得分 ${Math.floor(contestStats.avg_score || 0)}`);
  } else {
    doc.text('• 大赛数据为空，参赛后即可查看评分曲线');
  }
  
  if (marketStats.total_transactions > 0) {
    doc.text(`• 交易市场共完成 ${marketStats.total_transactions} 笔交易，总交易额 ${marketStats.total_volume || 0} 金币`);
  } else {
    doc.text('• 暂无交易记录，在市场买卖物品后即可查看价格走势');
  }
  
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
