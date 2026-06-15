export const RARITY_COLORS: Record<string, string> = {
  common: '#95a5a6',
  uncommon: '#27ae60',
  rare: '#3498db',
  epic: '#9b59b6',
  legendary: '#f39c12'
};

export const RARITY_NAMES: Record<string, string> = {
  common: '普通',
  uncommon: '优秀',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说'
};

export const AFFIX_INFO: Record<string, { name: string; description: string; color: string }> = {
  echo: { name: '回响', description: '探测时有几率触发二次回响，获得双倍收益', color: '#9b59b6' },
  penetration: { name: '穿透', description: '声波可穿透障碍物，探测范围+20%', color: '#3498db' },
  resonance: { name: '共振', description: '探测精度+25%，更容易发现稀有声波', color: '#e74c3c' },
  harmony: { name: '和谐', description: '大赛中观众共鸣值+30%', color: '#f39c12' },
  deep_sight: { name: '深视', description: '有几率发现隐藏的声波秘境', color: '#8e44ad' },
  time_warp: { name: '时曲', description: '大赛中声波强度衰减速度-50%', color: '#16a085' },
  amplification: { name: '增幅', description: '基础探测强度+15%', color: '#27ae60' },
  clarity: { name: '清澈', description: '声波噪音减少，评分更加稳定', color: '#00bcd4' }
};

export const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const getQualityColor = (quality: number): string => {
  if (quality >= 90) return '#f39c12';
  if (quality >= 75) return '#9b59b6';
  if (quality >= 60) return '#3498db';
  if (quality >= 40) return '#27ae60';
  return '#95a5a6';
};
