const { RARITY_WEIGHTS, AFFIXES } = require('./craftingEngine');

const SKILL_EFFECTS = {
  focus_boost: {
    id: 'focus_boost',
    name: '聚焦增强',
    description: '临时提升声波强度30%，持续10秒',
    cooldown: 30,
    duration: 10,
    effect: { intensityMultiplier: 1.3 }
  },
  interference_pulse: {
    id: 'interference_pulse',
    name: '干扰脉冲',
    description: '降低对手声波强度30%，持续8秒',
    cooldown: 45,
    duration: 8,
    effect: { opponentDebuff: 0.7 }
  }
};

function calculateBaseScore(detector, soundWaveData) {
  const rarityScore = (RARITY_WEIGHTS[detector.rarity] || 1) * 100;
  
  const frequencyScore = soundWaveData.frequency * (detector.precision / 50);
  
  const intensityScore = soundWaveData.intensity * (detector.range / 100);
  
  let affixBonus = 1;
  const affixes = typeof detector.affixes === 'string' ? JSON.parse(detector.affixes) : (detector.affixes || []);
  affixes.forEach(affixId => {
    const affix = AFFIXES[affixId];
    if (affix?.effect?.intensityBonus) {
      affixBonus += affix.effect.intensityBonus;
    }
  });
  
  const totalScore = (rarityScore * 0.3 + frequencyScore * 0.35 + intensityScore * 0.35) * affixBonus;
  
  return {
    total: Math.floor(totalScore),
    rarity: Math.floor(rarityScore * 0.3),
    frequency: Math.floor(frequencyScore * 0.35),
    intensity: Math.floor(intensityScore * 0.35),
    affixBonus
  };
}

function calculateAudienceResonance(detector, currentScore, contestDuration) {
  let resonance = 0;
  
  const normalizedScore = Math.min(currentScore / 1000, 1);
  resonance += normalizedScore * 50;
  
  const rarityBonus = (RARITY_WEIGHTS[detector.rarity] || 1) * 10;
  resonance += rarityBonus;
  
  const affixes = typeof detector.affixes === 'string' ? JSON.parse(detector.affixes) : (detector.affixes || []);
  if (affixes?.includes('harmony')) {
    resonance *= 1.3;
  }
  
  const timeFactor = 1 - (contestDuration / 300) * 0.3;
  resonance *= Math.max(0.5, timeFactor);
  
  return Math.floor(resonance);
}

function generateSoundWaveData(detector, timeElapsed) {
  const baseIntensity = detector.range * 0.5 + detector.precision * 0.3;
  
  const waveVariation = Math.sin(timeElapsed * 0.1) * 0.1 + 1;
  
  const decayFactor = Math.max(0.6, 1 - (timeElapsed / 180) * 0.25);
  
  let decayMultiplier = decayFactor;
  if (detector.affixes?.includes('time_warp')) {
    decayMultiplier = 1 - (1 - decayFactor) * 0.5;
  }
  
  const noise = 0;
  
  const currentIntensity = baseIntensity * waveVariation * decayMultiplier * (1 + noise);
  
  const frequency = 50 + detector.precision * 0.5 + Math.sin(timeElapsed * 0.05) * 5;
  
  const rarityLevel = RARITY_WEIGHTS[detector.rarity] || 1;
  const rarityValue = rarityLevel * 20 + 5;
  
  return {
    intensity: Math.floor(currentIntensity),
    baseIntensity: Math.floor(baseIntensity),
    frequency: Math.floor(frequency),
    rarityValue: Math.floor(rarityValue),
    wavePattern: generateWavePattern(timeElapsed, detector)
  };
}

function generateWavePattern(time, detector) {
  const pattern = [];
  const baseFreq = 50 + detector.precision * 0.5;
  
  for (let i = 0; i < 10; i++) {
    const t = time + i * 0.1;
    const amplitude = Math.sin(t * 0.1) * 0.5 + 0.5;
    const freq = baseFreq + Math.sin(t * 0.05) * 20;
    pattern.push({ time: i, amplitude: amplitude.toFixed(2), freq: freq.toFixed(0) });
  }
  
  return pattern;
}

function applySkill(entry, skillType, targetEntry = null) {
  const skill = SKILL_EFFECTS[skillType];
  if (!skill) return null;
  
  const now = Date.now();
  const lastUsed = entry.lastSkillUse?.[skillType] || 0;
  
  if (now - lastUsed < skill.cooldown * 1000) {
    return { success: false, reason: '冷却中', cooldownRemaining: skill.cooldown - (now - lastUsed) / 1000 };
  }
  
  const result = {
    success: true,
    skill: skillType,
    effect: skill.effect,
    duration: skill.duration,
    timestamp: now
  };
  
  if (skillType === 'focus_boost') {
    entry.activeBuffs = entry.activeBuffs || [];
    entry.activeBuffs.push({
      type: 'focus_boost',
      multiplier: skill.effect.intensityMultiplier,
      endTime: now + skill.duration * 1000
    });
  }
  
  if (skillType === 'interference_pulse' && targetEntry) {
    targetEntry.activeDebuffs = targetEntry.activeDebuffs || [];
    targetEntry.activeDebuffs.push({
      type: 'interference_pulse',
      multiplier: skill.effect.opponentDebuff,
      endTime: now + skill.duration * 1000
    });
    result.targetAffected = true;
  }
  
  entry.lastSkillUse = entry.lastSkillUse || {};
  entry.lastSkillUse[skillType] = now;
  
  return result;
}

function calculateIntensityWithModifiers(entry, baseIntensity) {
  let intensity = baseIntensity;
  
  const now = Date.now();
  
  entry.activeBuffs?.forEach(buff => {
    if (buff.endTime > now) {
      intensity *= buff.multiplier;
    }
  });
  
  entry.activeDebuffs?.forEach(debuff => {
    if (debuff.endTime > now) {
      intensity *= debuff.multiplier;
    }
  });
  
  return intensity;
}

function calculateMatchRewards(rank, totalParticipants) {
  const rewards = {
    points: 0,
    gold: 0,
    materials: [],
    designs: []
  };
  
  const topPercent = rank / totalParticipants;
  
  if (topPercent <= 0.01) {
    rewards.points = 500;
    rewards.gold = 2000;
    rewards.designs.push('rare_design');
  } else if (topPercent <= 0.05) {
    rewards.points = 300;
    rewards.gold = 1000;
  } else if (topPercent <= 0.1) {
    rewards.points = 150;
    rewards.gold = 500;
  } else if (topPercent <= 0.25) {
    rewards.points = 80;
    rewards.gold = 200;
  } else if (topPercent <= 0.5) {
    rewards.points = 40;
    rewards.gold = 100;
  } else {
    rewards.points = 10;
    rewards.gold = 20;
  }
  
  return rewards;
}

function matchOpponents(entries, matchCount = 3) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const matches = [];
  
  for (let i = 0; i < sorted.length; i += 2) {
    if (i + 1 < sorted.length) {
      matches.push({
        player1: sorted[i],
        player2: sorted[i + 1],
        startTime: Date.now() + Math.random() * 5000
      });
    }
  }
  
  return matches;
}

module.exports = {
  SKILL_EFFECTS,
  calculateBaseScore,
  calculateAudienceResonance,
  generateSoundWaveData,
  applySkill,
  calculateIntensityWithModifiers,
  calculateMatchRewards,
  matchOpponents
};
