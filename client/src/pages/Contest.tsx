import React, { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchCurrentContest, joinContest, applyContestSkill, fetchContestHistory, fetchOpponents, clearExpiredBuffs } from '../store/slices/contestSlice';
import { fetchDetectors } from '../store/slices/craftingSlice';
import { RARITY_COLORS, RARITY_NAMES, formatTime } from '../utils/constants';
import { joinContestRoom, leaveContestRoom } from '../services/socket';
import './Contest.scss';

const Contest: React.FC = () => {
  const dispatch = useDispatch();
  const { currentContest, userEntry, standings, opponents, history, loading, skillCooldowns, activeBuffs } = useSelector((state: RootState) => state.contest);
  const { detectors } = useSelector((state: RootState) => state.crafting);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedDetector, setSelectedDetector] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [intensity, setIntensity] = useState(0);
  const [wavePattern, setWavePattern] = useState<any[]>([]);
  const [showTargetSelect, setShowTargetSelect] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    dispatch(fetchCurrentContest() as any);
    dispatch(fetchDetectors() as any);
    dispatch(fetchContestHistory() as any);
  }, [dispatch]);

  useEffect(() => {
    if (currentContest?.id) {
      joinContestRoom(currentContest.id);
    }
    return () => {
      if (currentContest?.id) {
        leaveContestRoom(currentContest.id);
      }
    };
  }, [currentContest?.id]);

  useEffect(() => {
    if (userEntry) {
      dispatch(fetchOpponents() as any);
    }
  }, [userEntry, dispatch]);

  useEffect(() => {
    if (userEntry) {
      setIntensity(userEntry.current_intensity || 0);
      
      const pattern = [];
      for (let i = 0; i < 20; i++) {
        pattern.push({
          time: i,
          amplitude: (Math.sin(Date.now() / 1000 + i * 0.5) * 0.3 + 0.7).toFixed(2)
        });
      }
      setWavePattern(pattern);
    }
  }, [userEntry]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (userEntry && currentContest?.status === 'active') {
      interval = setInterval(() => {
        const baseIntensity = userEntry.current_intensity || 50;
        const variation = Math.sin(Date.now() / 500) * 10;
        
        let finalIntensity = baseIntensity + variation;
        const hasFocusBoost = activeBuffs.some((b: any) => b.type === 'focus_boost' && b.endTime > Date.now());
        if (hasFocusBoost) {
          finalIntensity *= 1.2;
        }
        
        setIntensity(Math.floor(finalIntensity));
        
        setWavePattern(prev => {
          const newPattern = [...prev.slice(1)];
          newPattern.push({
            time: Date.now(),
            amplitude: (Math.sin(Date.now() / 300) * 0.3 + 0.7).toFixed(2)
          });
          return newPattern;
        });
        
        dispatch(clearExpiredBuffs());
        setTick(t => t + 1);
      }, 200);
    }
    return () => clearInterval(interval);
  }, [userEntry, currentContest?.status, activeBuffs, dispatch]);

  const getSkillCooldownRemaining = useCallback((skillType: string) => {
    const endTime = skillCooldowns[skillType];
    if (!endTime) return 0;
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    return remaining;
  }, [skillCooldowns]);

  const getBuffRemainingTime = useCallback((buffType: string) => {
    const buff = activeBuffs.find((b: any) => b.type === buffType);
    if (!buff) return 0;
    return Math.max(0, Math.ceil((buff.endTime - Date.now()) / 1000));
  }, [activeBuffs]);

  const handleJoin = () => {
    if (!selectedDetector) return;
    dispatch(joinContest(selectedDetector.id) as any).then(() => {
      setShowJoinModal(false);
      dispatch(fetchCurrentContest() as any);
    });
  };

  const handleUseSkill = (skillType: string) => {
    if (getSkillCooldownRemaining(skillType) > 0) return;
    
    if (skillType === 'interference_pulse') {
      if (opponents.length === 0) {
        alert('暂无对手可干扰');
        return;
      }
      setShowTargetSelect(true);
      return;
    }
    
    dispatch(applyContestSkill({ skillType }) as any).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled') {
        setTimeout(() => {
          dispatch(fetchCurrentContest() as any);
          dispatch(fetchOpponents() as any);
        }, 500);
      }
    });
  };

  const handleConfirmInterference = () => {
    if (!selectedTarget) return;
    
    dispatch(applyContestSkill({ 
      skillType: 'interference_pulse', 
      targetEntryId: selectedTarget.id 
    }) as any).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled') {
        setShowTargetSelect(false);
        setSelectedTarget(null);
        setTimeout(() => {
          dispatch(fetchCurrentContest() as any);
          dispatch(fetchOpponents() as any);
        }, 500);
      }
    });
  };

  const contestStatus = currentContest?.status;
  const isActive = contestStatus === 'active';
  const hasFocusBoost = activeBuffs.some((b: any) => b.type === 'focus_boost' && b.endTime > Date.now());

  return (
    <div className="contest-page">
      <div className="contest-header">
        <div className="contest-info">
          <h2>🏆 今日回声大赛</h2>
          <p className="contest-theme">主题: {currentContest?.theme || '加载中...'}</p>
        </div>
        <div className="contest-status">
          <span className={`status-badge ${contestStatus}`}>
            {contestStatus === 'active' ? '进行中' : 
             contestStatus === 'upcoming' ? '即将开始' : '已结束'}
          </span>
          <span className="participant-count">
            👥 {currentContest?.participant_count || 0} 人参赛
          </span>
        </div>
      </div>

      <div className="tabs">
        <div 
          className={`tab ${activeTab === 'current' ? 'active' : ''}`}
          onClick={() => setActiveTab('current')}
        >
          当前比赛
        </div>
        <div 
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          历史记录
        </div>
      </div>

      {activeTab === 'current' && (
        <div className="contest-content">
          <div className="contest-main">
            {userEntry ? (
              <div className="my-entry">
                <h3>我的参赛</h3>
                
                {hasFocusBoost && (
                  <div className="buff-indicator focus">
                    🎯 聚焦增强生效中 - 剩余 {getBuffRemainingTime('focus_boost')}s
                  </div>
                )}
                
                <div className="wave-visualization">
                  <div className="wave-canvas">
                    {wavePattern.map((point, i) => (
                      <div
                        key={i}
                        className={`wave-bar ${hasFocusBoost ? 'boosted' : ''}`}
                        style={{ height: `${point.amplitude * 100}%` }}
                      ></div>
                    ))}
                  </div>
                  <div className="wave-stats">
                    <div className="stat">
                      <span className="label">当前强度</span>
                      <span className={`value ${hasFocusBoost ? 'boosted' : ''}`}>{intensity}</span>
                    </div>
                    <div className="stat">
                      <span className="label">当前分数</span>
                      <span className="value score">{userEntry.score || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="entry-info">
                  <div className="info-row">
                    <span>稀有度分</span>
                    <span>{userEntry.rarity_score || 0}</span>
                  </div>
                  <div className="info-row">
                    <span>频率分</span>
                    <span>{userEntry.frequency_score || 0}</span>
                  </div>
                  <div className="info-row">
                    <span>强度分</span>
                    <span>{userEntry.intensity_score || 0}</span>
                  </div>
                  <div className="info-row">
                    <span>观众共鸣</span>
                    <span>{userEntry.audience_resonance || 0}%</span>
                  </div>
                </div>

                {isActive && (
                  <div className="skill-panel">
                    <h4>比赛技能</h4>
                    <div className="skills">
                      <button 
                        className={`skill-btn focus ${hasFocusBoost ? 'active' : ''}`}
                        onClick={() => handleUseSkill('focus_boost')}
                        disabled={getSkillCooldownRemaining('focus_boost') > 0}
                      >
                        <span className="skill-icon">🎯</span>
                        <span className="skill-name">聚焦增强</span>
                        <span className="skill-desc">强度+20%，持续10秒</span>
                        {getSkillCooldownRemaining('focus_boost') > 0 && (
                          <span className="cooldown">
                            冷却 {getSkillCooldownRemaining('focus_boost')}s
                          </span>
                        )}
                      </button>
                      <button 
                        className="skill-btn interference"
                        onClick={() => handleUseSkill('interference_pulse')}
                        disabled={getSkillCooldownRemaining('interference_pulse') > 0}
                      >
                        <span className="skill-icon">💫</span>
                        <span className="skill-name">干扰脉冲</span>
                        <span className="skill-desc">对手-15%，持续8秒</span>
                        {getSkillCooldownRemaining('interference_pulse') > 0 && (
                          <span className="cooldown">
                            冷却 {getSkillCooldownRemaining('interference_pulse')}s
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {isActive && opponents.length > 0 && (
                  <div className="opponents-panel">
                    <h4>可干扰对手 (点击查看)</h4>
                    <div className="opponents-list">
                      {opponents.slice(0, 5).map((opponent: any, index: number) => (
                        <div 
                          key={opponent.id} 
                          className="opponent-item"
                          onClick={() => { setSelectedTarget(opponent); setShowTargetSelect(true); }}
                        >
                          <span className="opp-rank">#{index + 1}</span>
                          <span className="opp-name">{opponent.nickname}</span>
                          <span 
                            className="opp-rarity"
                            style={{ color: RARITY_COLORS[opponent.rarity] }}
                          >
                            {RARITY_NAMES[opponent.rarity]}
                          </span>
                          <span className="opp-score">{opponent.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-entry">
                <div className="no-entry-icon">🎵</div>
                <h3>还未参加今日比赛</h3>
                <p>选择你的探测器，加入回声大赛吧！</p>
                <button 
                  className="join-btn"
                  onClick={() => setShowJoinModal(true)}
                  disabled={!isActive}
                >
                  {isActive ? '立即参赛' : '比赛未开始'}
                </button>
              </div>
            )}
          </div>

          <div className="standings-panel">
            <h3>🏅 实时排行</h3>
            <div className="standings-list">
              {standings.slice(0, 20).map((entry: any, index: number) => (
                <div 
                  key={entry.id} 
                  className={`standing-item ${entry.player_id === userEntry?.player_id ? 'me' : ''}`}
                >
                  <span className={`rank rank-${index + 1}`}>{index + 1}</span>
                  <span className="player-name">{entry.nickname || '匿名玩家'}</span>
                  <span 
                    className="detector-rarity"
                    style={{ color: RARITY_COLORS[entry.rarity] }}
                  >
                    {RARITY_NAMES[entry.rarity] || ''}
                  </span>
                  <span className="score">{entry.score}</span>
                </div>
              ))}
              {standings.length === 0 && (
                <div className="empty-standings">
                  暂无参赛者
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-list">
          {history.map((entry: any) => (
            <div key={entry.id} className="history-item">
              <div className="history-date">{entry.date}</div>
              <div className="history-theme">{entry.theme}</div>
              <div className="history-score">
                得分: <span>{entry.score}</span>
              </div>
              <div className="history-rank">
                排名: <span>#{entry.rank || '-'}</span>
              </div>
            </div>
          ))}
          {history.length === 0 && (
            <div className="empty-history">
              暂无参赛记录
            </div>
          )}
        </div>
      )}

      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>选择探测器参赛</h3>
            <div className="detector-select-list">
              {detectors.map((detector: any) => (
                <div
                  key={detector.id}
                  className={`detector-option ${selectedDetector?.id === detector.id ? 'selected' : ''}`}
                  style={{ borderColor: RARITY_COLORS[detector.rarity] }}
                  onClick={() => setSelectedDetector(detector)}
                >
                  <div className="detector-name">{detector.name}</div>
                  <div className="detector-stats-mini">
                    <span>品质: {detector.quality}</span>
                    <span>范围: {detector.range}</span>
                    <span>精度: {detector.precision}</span>
                  </div>
                  <span 
                    className="rarity-tag"
                    style={{ background: RARITY_COLORS[detector.rarity] }}
                  >
                    {RARITY_NAMES[detector.rarity]}
                  </span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowJoinModal(false)}>
                取消
              </button>
              <button 
                className="confirm-btn"
                onClick={handleJoin}
                disabled={!selectedDetector}
              >
                确认参赛
              </button>
            </div>
          </div>
        </div>
      )}

      {showTargetSelect && (
        <div className="modal-overlay" onClick={() => { setShowTargetSelect(false); setSelectedTarget(null); }}>
          <div className="modal target-select-modal" onClick={(e) => e.stopPropagation()}>
            <h3>选择干扰目标</h3>
            <p className="modal-hint">选择一名对手释放干扰脉冲，降低其声波强度15%</p>
            <div className="target-list">
              {opponents.map((opponent: any, index: number) => (
                <div
                  key={opponent.id}
                  className={`target-item ${selectedTarget?.id === opponent.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTarget(opponent)}
                >
                  <span className="target-rank">#{index + 1}</span>
                  <div className="target-info">
                    <span className="target-name">{opponent.nickname}</span>
                    <span 
                      className="target-detector"
                      style={{ color: RARITY_COLORS[opponent.rarity] }}
                    >
                      {opponent.detector_name}
                    </span>
                  </div>
                  <span className="target-score">{opponent.score} 分</span>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => { setShowTargetSelect(false); setSelectedTarget(null); }}>
                取消
              </button>
              <button 
                className="confirm-btn interference"
                onClick={handleConfirmInterference}
                disabled={!selectedTarget}
              >
                💫 释放干扰
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contest;
