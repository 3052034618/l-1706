const AFFIXES = {
  echo: {
    id: 'echo',
    name: '回响',
    description: '探测时有几率触发二次回响，获得双倍收益',
    rarity: 'rare',
    triggerChance: 0.15,
    effect: { doubleDipChance: 0.15 },
    color: '#9b59b6'
  },
  penetration: {
    id: 'penetration',
    name: '穿透',
    description: '声波可穿透障碍物，探测范围+20%',
    rarity: 'epic',
    triggerChance: 0.08,
    effect: { rangeBonus: 0.2 },
    color: '#3498db'
  },
  resonance: {
    id: 'resonance',
    name: '共振',
    description: '探测精度+25%，更容易发现稀有声波',
    rarity: 'epic',
    triggerChance: 0.08,
    effect: { precisionBonus: 0.25 },
    color: '#e74c3c'
  },
  harmony: {
    id: 'harmony',
    name: '和谐',
    description: '大赛中观众共鸣值+30%',
    rarity: 'rare',
    triggerChance: 0.1,
    effect: { audienceBonus: 0.3 },
    color: '#f39c12'
  },
  deep_sight: {
    id: 'deep_sight',
    name: '深视',
    description: '有几率发现隐藏的声波秘境',
    rarity: 'legendary',
    triggerChance: 0.03,
    effect: { secretFindChance: 0.05 },
    color: '#8e44ad'
  },
  time_warp: {
    id: 'time_warp',
    name: '时曲',
    description: '大赛中声波强度衰减速度-50%',
    rarity: 'legendary',
    triggerChance: 0.03,
    effect: { decayReduction: 0.5 },
    color: '#16a085'
  },
  amplification: {
    id: 'amplification',
    name: '增幅',
    description: '基础探测强度+15%',
    rarity: 'uncommon',
    triggerChance: 0.2,
    effect: { intensityBonus: 0.15 },
    color: '#27ae60'
  },
  clarity: {
    id: 'clarity',
    name: '清澈',
    description: '声波噪音减少，评分更加稳定',
    rarity: 'uncommon',
    triggerChance: 0.25,
    effect: { stabilityBonus: 0.2 },
    color: '#00bcd4'
  }
};

const RARITY_WEIGHTS = {
  common: 1,
  uncommon: 1.5,
  rare: 2.5,
  epic: 4,
  legendary: 7
};

const RARITY_COLORS = {
  common: '#95a5a6',
  uncommon: '#27ae60',
  rare: '#3498db',
  epic: '#9b59b6',
  legendary: '#f39c12'
};

const QUALITY_RANGES = {
  common: { min: 0, max: 40 },
  uncommon: { min: 30, max: 60 },
  rare: { min: 50, max: 75 },
  epic: { min: 65, max: 85 },
  legendary: { min: 80, max: 100 }
};

function calculateAffixTrigger(quality, echosmithSkill, materialRarities) {
  const baseChance = quality / 500;
  
  const skillBonus = echosmithSkill * 0.02;
  
  let rarityBonus = 0;
  materialRarities.forEach(r => {
    rarityBonus += (RARITY_WEIGHTS[r] || 1) * 0.01;
  });
  
  const totalChance = baseChance + skillBonus + rarityBonus;
  
  return Math.min(totalChance, 0.8);
}

function rollAffixes(quality, echosmithSkills, materialRarities, count = 1) {
  const affixes = [];
  const triggerChance = calculateAffixTrigger(quality, echosmithSkills.detection, materialRarities);
  
  const affixPool = Object.values(AFFIXES).sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < count && i < affixPool.length; i++) {
    const affix = affixPool[i];
    const rarityModifier = 1 / RARITY_WEIGHTS[affix.rarity];
    const actualChance = triggerChance * rarityModifier * affix.triggerChance * 10;
    
    if (Math.random() < actualChance) {
      affixes.push(affix.id);
    }
  }
  
  return affixes;
}

function calculateHiddenAttributes(quality, materials, echosmithModulation) {
  const attributes = [];
  
  if (Math.random() < (quality / 200) * (echosmithModulation / 10)) {
    const types = [
      { type: 'extra_range', name: '额外范围', value: Math.floor(Math.random() * 20) + 5, unit: '%' },
      { type: 'extra_precision', name: '额外精度', value: Math.floor(Math.random() * 15) + 3, unit: '%' },
      { type: 'lucky_find', name: '幸运发现', value: (Math.random() * 0.1).toFixed(2), unit: '几率' },
      { type: 'energy_efficient', name: '节能', value: Math.floor(Math.random() * 25) + 10, unit: '%' }
    ];
    
    const attr = types[Math.floor(Math.random() * types.length)];
    attributes.push(attr);
  }
  
  return attributes;
}

function getDetectorRarity(quality, affixCount) {
  if (quality >= 90 && affixCount >= 2) return 'legendary';
  if (quality >= 75 && affixCount >= 1) return 'epic';
  if (quality >= 60) return 'rare';
  if (quality >= 40) return 'uncommon';
  return 'common';
}

function calculateCraftingResult(recipe, materials, echosmith, workshopBonus = 0, guildBonus = 0) {
  const materialQualities = materials.map(m => m.quality || 50);
  const avgMaterialQuality = materialQualities.reduce((a, b) => a + b, 0) / materials.length;
  
  const skillFactor = (echosmith.hearing_skill + echosmith.modulation_skill + echosmith.detection_skill) / 30;
  const workshopFactor = 1 + workshopBonus;
  const guildFactor = 1 + guildBonus;
  
  const baseQuality = avgMaterialQuality * 0.6 + skillFactor * 20 * 0.4;
  const quality = Math.min(100, Math.max(1, baseQuality * workshopFactor * guildFactor));
  
  const rangeMultiplier = quality / 50;
  const precisionMultiplier = quality / 60;
  
  const baseRange = recipe.base_range * rangeMultiplier;
  const basePrecision = recipe.base_precision * precisionMultiplier;
  
  const range = Math.floor(baseRange * workshopFactor * guildFactor);
  const precision = Math.min(100, Math.floor(basePrecision * workshopFactor * guildFactor));
  
  const materialRarities = materials.map(m => m.rarity || 'common');
  const maxAffixes = Math.floor(quality / 30) + 1;
  const affixes = rollAffixes(quality, echosmith, materialRarities, maxAffixes);
  
  const rarity = getDetectorRarity(quality, affixes.length);
  
  const hiddenAttributes = calculateHiddenAttributes(quality, materials, echosmith.modulation_skill);
  
  return {
    quality: Math.floor(quality),
    range,
    precision,
    rarity,
    affixes,
    hiddenAttributes,
    tier: recipe.tier
  };
}

module.exports = {
  AFFIXES,
  RARITY_WEIGHTS,
  RARITY_COLORS,
  QUALITY_RANGES,
  calculateAffixTrigger,
  rollAffixes,
  calculateHiddenAttributes,
  getDetectorRarity,
  calculateCraftingResult
};
