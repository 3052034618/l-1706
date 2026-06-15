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
  
  const allCrafting = db.prepare('SELECT * FROM crafting_tasks').all();
  const weekCrafting = allCrafting.filter(t => t.start_time >= weekStart && t.status === 'completed');
  
  const allDetectors = db.prepare('SELECT * FROM detectors').all();
  const weekDetectors = allDetectors.filter(d => d.created_at >= weekStart);
  
  const rarityMap = {};
  weekDetectors.forEach(d => {
    rarityMap[d.rarity] = (rarityMap[d.rarity] || 0) + 1;
  });
  const detectorRarity = Object.entries(rarityMap).map(([rarity, count]) => ({ rarity, count }));
  
  const materialsUsed = calculateMaterialsUsed(allCrafting, weekStart, db);
  
  const allContestEntries = db.prepare('SELECT * FROM contest_entries').all();
  const allContests = db.prepare('SELECT * FROM contests').all();
  const weekContests = allContests.filter(c => {
    const contestDate = new Date(c.date).getTime();
    return contestDate >= weekStart;
  });
  const weekContestIds = new Set(weekContests.map(c => c.id));
  const weekEntries = allContestEntries.filter(e => weekContestIds.has(e.contest_id));
  
  const contestStats = {
    total_entries: weekEntries.length,
    avg_score: weekEntries.length > 0 
      ? weekEntries.reduce((sum, e) => sum + (e.score || 0), 0) / weekEntries.length 
      : 0
  };
  
  const allTransactions = db.prepare('SELECT * FROM market_transactions').all();
  const weekTransactions = allTransactions.filter(t => t.timestamp >= weekStart);
  
  const marketStats = {
    total_transactions: weekTransactions.length,
    total_volume: weekTransactions.reduce((sum, t) => sum + (t.price || 0), 0),
    avg_price: weekTransactions.length > 0
      ? weekTransactions.reduce((sum, t) => sum + (t.price || 0), 0) / weekTransactions.length
      : 0
  };
  
  const allPlayers = db.prepare('SELECT * FROM players').all();
  const playerMap = Object.fromEntries(allPlayers.map(p => [p.id, p]));
  
  const topDetectors = [...weekDetectors]
    .sort((a, b) => (b.quality || 0) - (a.quality || 0))
    .slice(0, 5)
    .map(d => ({
      ...d,
      nickname: playerMap[d.player_id]?.nickname || '未知',
      affixes: JSON.parse(d.affixes || '[]')
    }));
  
  const priceTrends = calculatePriceTrends(weekTransactions, db);
  const dailyPriceData = calculateDailyPriceData(weekTransactions, weekStart, db);
  const radarData = calculateRadarData(weekDetectors);
  const contestScoreHistory = calculateContestScoreHistory(allContests, allContestEntries, weekStart);
  
  const report = {
    weekNumber,
    year: now.getFullYear(),
    period: { start: weekStart, end: weekEnd },
    summary: {
      totalCrafting: weekCrafting.length,
      totalDetectors: weekDetectors.length,
      detectorByRarity: detectorRarity,
      totalContestEntries: contestStats.total_entries,
      avgContestScore: Math.floor(contestStats.avg_score),
      totalTransactions: marketStats.total_transactions,
      totalVolume: marketStats.total_volume,
      avgTransactionPrice: Math.floor(marketStats.avg_price)
    },
    topMaterials: materialsUsed,
    topDetectors,
    priceTrends,
    dailyPriceData,
    radarData,
    contestScoreHistory
  };
  
  res.json(report);
});

function calculateMaterialsUsed(allCrafting, weekStart, db) {
  const allMaterials = db.prepare('SELECT * FROM materials').all();
  const materialMap = Object.fromEntries(allMaterials.map(m => [m.id, m]));
  
  const usageMap = {};
  
  allCrafting.forEach(task => {
    if (task.start_time < weekStart) return;
    try {
      const materials = JSON.parse(task.materials || '[]');
      materials.forEach(m => {
        const id = m.material_id || m.id;
        if (!usageMap[id]) {
          usageMap[id] = {
            id,
            name: materialMap[id]?.name || id,
            type: materialMap[id]?.type || 'common',
            rarity: materialMap[id]?.rarity || 'common',
            times_used: 0
          };
        }
        usageMap[id].times_used += 1;
      });
    } catch (e) {}
  });
  
  return Object.values(usageMap)
    .sort((a, b) => b.times_used - a.times_used)
    .slice(0, 10);
}

function calculatePriceTrends(weekTransactions, db) {
  const allMaterials = db.prepare('SELECT * FROM materials').all();
  const materialMap = Object.fromEntries(allMaterials.map(m => [m.id, m]));
  
  const priceMap = {};
  
  weekTransactions.forEach(t => {
    try {
      const itemData = JSON.parse(t.item_data || '{}');
      const materialId = itemData.material_id;
      if (!materialId) return;
      
      if (!priceMap[materialId]) {
        priceMap[materialId] = {
          id: materialId,
          name: materialMap[materialId]?.name || materialId,
          total_price: 0,
          volume: 0
        };
      }
      priceMap[materialId].total_price += (t.price || 0);
      priceMap[materialId].volume += 1;
    } catch (e) {}
  });
  
  return Object.values(priceMap)
    .map(p => ({
      ...p,
      avg_price: p.volume > 0 ? Math.floor(p.total_price / p.volume) : 0
    }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 8);
}

function calculateDailyPriceData(weekTransactions, weekStart, db) {
  const allMaterials = db.prepare('SELECT * FROM materials').all();
  const materialMap = Object.fromEntries(allMaterials.map(m => [m.id, m]));
  
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const dailyMaterialTotals = {};
  const dailyMaterialCounts = {};
  const topMaterialIds = new Set();
  
  const totalsByMaterial = {};
  weekTransactions.forEach(t => {
    try {
      const itemData = JSON.parse(t.item_data || '{}');
      if (itemData.material_id) {
        totalsByMaterial[itemData.material_id] = (totalsByMaterial[itemData.material_id] || 0) + 1;
      }
    } catch (e) {}
  });
  
  const topMaterials = Object.entries(totalsByMaterial)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  topMaterials.forEach(id => topMaterialIds.add(id));
  
  for (let i = 0; i < 7; i++) {
    const dayStart = weekStart + i * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    
    const dayTransactions = weekTransactions.filter(t => 
      t.timestamp >= dayStart && t.timestamp < dayEnd
    );
    
    topMaterialIds.forEach(matId => {
      if (!dailyMaterialTotals[matId]) dailyMaterialTotals[matId] = Array(7).fill(0);
      if (!dailyMaterialCounts[matId]) dailyMaterialCounts[matId] = Array(7).fill(0);
      
      const todayMatTransactions = dayTransactions.filter(t => {
        try {
          const itemData = JSON.parse(t.item_data || '{}');
          return itemData.material_id === matId;
        } catch (e) { return false; }
      });
      
      const dayPrices = todayMatTransactions.map(t => t.price || 0);
      if (dayPrices.length > 0) {
        dailyMaterialTotals[matId][i] = dayPrices.reduce((a, b) => a + b, 0);
        dailyMaterialCounts[matId][i] = dayPrices.length;
      }
    });
  }
  
  const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6'];
  const datasets = topMaterials.map((matId, index) => ({
    name: materialMap[matId]?.name || matId,
    data: Array.from({ length: 7 }, (_, i) => {
      const count = dailyMaterialCounts[matId]?.[i] || 0;
      const total = dailyMaterialTotals[matId]?.[i] || 0;
      return count > 0 ? Math.floor(total / count) : 0;
    }),
    color: colors[index % colors.length]
  }));
  
  return { labels: days, datasets };
}

function calculateRadarData(weekDetectors) {
  let totalRange = 0, totalPrecision = 0, totalQuality = 0;
  let totalAffixes = 0, totalValue = 0, rarityScore = 0;
  const count = weekDetectors.length;
  
  if (count === 0) {
    return {
      labels: ['探测范围', '精度', '品质', '稀有度', '词缀数', '收藏价值'],
      values: [0, 0, 0, 0, 0, 0]
    };
  }
  
  weekDetectors.forEach(d => {
    totalRange += d.range || 0;
    totalPrecision += d.precision || 0;
    totalQuality += d.quality || 0;
    try {
      const affixes = JSON.parse(d.affixes || '[]');
      totalAffixes += affixes.length;
    } catch (e) {}
    totalValue += d.market_value || 0;
    
    const rarityWeights = {
      common: 20, uncommon: 40, rare: 60, epic: 80, legendary: 100
    };
    rarityScore += rarityWeights[d.rarity] || 20;
  });
  
  const maxRange = 300;
  const maxPrecision = 100;
  const maxQuality = 100;
  const maxAffixes = 5;
  const maxValue = 5000;
  
  return {
    labels: ['探测范围', '精度', '品质', '稀有度', '词缀数', '收藏价值'],
    values: [
      Math.min(Math.floor((totalRange / count) / maxRange * 100), 100),
      Math.min(Math.floor((totalPrecision / count) / maxPrecision * 100), 100),
      Math.min(Math.floor((totalQuality / count) / maxQuality * 100), 100),
      Math.min(Math.floor(rarityScore / count), 100),
      Math.min(Math.floor((totalAffixes / count) / maxAffixes * 100), 100),
      Math.min(Math.floor((totalValue / count) / maxValue * 100), 100)
    ]
  };
}

function calculateContestScoreHistory(allContests, allContestEntries, weekStart) {
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const scores = [];
  const entries = [];
  
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart + i * 24 * 60 * 60 * 1000);
    const dateStr = dayDate.toISOString().split('T')[0];
    
    const dayContest = allContests.find(c => c.date === dateStr);
    
    if (dayContest) {
      const dayEntries = allContestEntries.filter(e => e.contest_id === dayContest.id);
      const avgScore = dayEntries.length > 0
        ? Math.floor(dayEntries.reduce((sum, e) => sum + (e.score || 0), 0) / dayEntries.length)
        : 0;
      scores.push(avgScore);
      entries.push(dayEntries.length);
    } else {
      scores.push(0);
      entries.push(0);
    }
  }
  
  return { labels: days, scores, entries };
}

router.get('/export/pdf', authMiddleware, (req, res) => {
  const db = getDb();
  const now = new Date();
  const weekNumber = getWeekNumber(now);
  const weekStart = getWeekStart(weekNumber, now.getFullYear());
  
  const allCrafting = db.prepare('SELECT * FROM crafting_tasks').all();
  const weekCrafting = allCrafting.filter(t => t.start_time >= weekStart && t.status === 'completed');
  
  const allDetectors = db.prepare('SELECT * FROM detectors').all();
  const weekDetectors = allDetectors.filter(d => d.created_at >= weekStart);
  
  const rarityMap = {};
  weekDetectors.forEach(d => {
    rarityMap[d.rarity] = (rarityMap[d.rarity] || 0) + 1;
  });
  const detectorRarity = Object.entries(rarityMap).map(([rarity, count]) => ({ rarity, count }));
  
  const allContestEntries = db.prepare('SELECT * FROM contest_entries').all();
  const allContests = db.prepare('SELECT * FROM contests').all();
  const weekContests = allContests.filter(c => {
    const contestDate = new Date(c.date).getTime();
    return contestDate >= weekStart;
  });
  const weekContestIds = new Set(weekContests.map(c => c.id));
  const weekEntries = allContestEntries.filter(e => weekContestIds.has(e.contest_id));
  
  const contestStats = {
    total_entries: weekEntries.length,
    avg_score: weekEntries.length > 0 
      ? weekEntries.reduce((sum, e) => sum + (e.score || 0), 0) / weekEntries.length 
      : 0
  };
  
  const allTransactions = db.prepare('SELECT * FROM market_transactions').all();
  const weekTransactions = allTransactions.filter(t => t.timestamp >= weekStart);
  
  const marketStats = {
    total_transactions: weekTransactions.length,
    total_volume: weekTransactions.reduce((sum, t) => sum + (t.price || 0), 0)
  };
  
  const allPlayers = db.prepare('SELECT * FROM players').all();
  const playerMap = Object.fromEntries(allPlayers.map(p => [p.id, p]));
  
  const topDetectors = [...weekDetectors]
    .sort((a, b) => (b.quality || 0) - (a.quality || 0))
    .slice(0, 5)
    .map(d => ({
      ...d,
      nickname: playerMap[d.player_id]?.nickname || '未知'
    }));
  
  const radarData = calculateRadarData(weekDetectors);
  const contestScoreHistory = calculateContestScoreHistory(allContests, allContestEntries, weekStart);
  const dailyPriceData = calculateDailyPriceData(weekTransactions, weekStart, db);
  
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
  doc.text(`• 总制作次数: ${weekCrafting.length}`);
  doc.text(`• 产出探测器: ${weekDetectors.length}`);
  doc.text(`• 大赛参赛数: ${contestStats.total_entries}`);
  doc.text(`• 平均大赛分数: ${Math.floor(contestStats.avg_score || 0)}`);
  doc.text(`• 交易总数: ${marketStats.total_transactions}`);
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
  doc.fontSize(18).text('📡 探测器属性雷达图');
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
  
  if (dailyPriceData.datasets.length > 0) {
    dailyPriceData.datasets.forEach((dataset) => {
      const avg = dataset.data.reduce((a, b) => a + b, 0) / 7;
      doc.fontSize(11).fillColor(dataset.color);
      doc.text(`• ${dataset.name}: 平均约 ${Math.floor(avg)} 金币`);
    });
  } else {
    doc.fontSize(11).fillColor('#666');
    doc.text('暂无交易数据，在市场进行交易后可查看价格走势');
  }
  
  doc.addPage();
  doc.fontSize(18).text('🏆 本周最佳探测器');
  doc.moveDown();
  
  if (topDetectors.length > 0) {
    topDetectors.forEach((detector, index) => {
      doc.fontSize(12).fillColor('#333');
      doc.text(`#${index + 1} ${detector.name}`);
      doc.fontSize(10).fillColor('#666');
      doc.text(`   拥有者: ${detector.nickname}`);
      doc.text(`   品质: ${detector.quality} | 范围: ${detector.range} | 精度: ${detector.precision}`);
      doc.moveDown(0.5);
    });
  } else {
    doc.fontSize(11).fillColor('#666');
    doc.text('暂无探测器数据，完成制作后可查看排行榜');
  }
  
  doc.moveDown(2);
  doc.fontSize(16).fillColor('#333').text('💡 趋势分析');
  doc.moveDown();
  doc.fontSize(11).fillColor('#555');
  
  if (weekCrafting.length > 0) {
    doc.text(`• 本周共完成 ${weekCrafting.length} 次制作，产出 ${weekDetectors.length} 个探测器`);
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
