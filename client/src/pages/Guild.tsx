import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchGuild, fetchGuildList, createGuild, joinGuild, leaveGuild, contributeGuild, upgradeTower } from '../store/slices/guildSlice';
import './Guild.scss';

const Guild: React.FC = () => {
  const dispatch = useDispatch();
  const { guild, members, tower, guilds, isMember } = useSelector((state: RootState) => state.guild);
  const { data: player } = useSelector((state: RootState) => state.player);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [guildName, setGuildName] = useState('');
  const [contributeAmount, setContributeAmount] = useState('100');

  useEffect(() => {
    dispatch(fetchGuild() as any);
    dispatch(fetchGuildList({}) as any);
  }, [dispatch]);

  const handleCreate = () => {
    if (!guildName.trim()) return;
    dispatch(createGuild(guildName) as any).then(() => {
      setShowCreateModal(false);
      dispatch(fetchGuild() as any);
    });
  };

  const handleJoin = (guildId: string) => {
    dispatch(joinGuild(guildId) as any).then(() => {
      dispatch(fetchGuild() as any);
    });
  };

  const handleLeave = () => {
    if (window.confirm('确定要退出公会吗？')) {
      dispatch(leaveGuild() as any).then(() => {
        dispatch(fetchGuild() as any);
      });
    }
  };

  const handleContribute = () => {
    const amount = parseInt(contributeAmount);
    if (isNaN(amount) || amount <= 0) return;
    dispatch(contributeGuild({ amount, type: 'gold' }) as any).then(() => {
      dispatch(fetchGuild() as any);
    });
  };

  const handleUpgradeTower = () => {
    dispatch(upgradeTower() as any).then(() => {
      dispatch(fetchGuild() as any);
    });
  };

  const isLeader = guild?.leader_id === player?.id;

  if (!isMember) {
    return (
      <div className="guild-page">
        <div className="no-guild">
          <div className="no-guild-icon">🏰</div>
          <h2>还没有加入公会</h2>
          <p>加入公会可获得制作和探测加成，与伙伴一起成长！</p>
          <div className="no-guild-actions">
            <button className="create-btn" onClick={() => setShowCreateModal(true)}>
              创建公会 (1000金币)
            </button>
          </div>
        </div>
        
        <div className="guild-list-section">
          <h3>可加入的公会</h3>
          <div className="guild-list">
            {guilds.map((g: any) => (
              <div key={g.id} className="guild-card">
                <div className="guild-card-header">
                  <h4>{g.name}</h4>
                  <span className="guild-level">Lv.{g.level}</span>
                </div>
                <div className="guild-info">
                  <span>👥 {g.member_count || 0}人</span>
                  <span>🏭 {g.workshop_count || 0}工坊</span>
                </div>
                <button 
                  className="join-btn"
                  onClick={() => handleJoin(g.id)}
                  disabled={g.member_count >= g.max_members}
                >
                  {g.member_count >= g.max_members ? '已满员' : '加入'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>创建公会</h3>
              <p className="modal-desc">创建公会需要 1000 金币</p>
              <input
                type="text"
                placeholder="请输入公会名称"
                value={guildName}
                onChange={(e) => setGuildName(e.target.value)}
              />
              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowCreateModal(false)}>取消</button>
                <button className="confirm-btn" onClick={handleCreate}>创建</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="guild-page">
      <div className="guild-header">
        <div className="guild-info">
          <h2>🏰 {guild?.name}</h2>
          <div className="guild-stats">
            <span>Lv.{guild?.level}</span>
            <span>👥 {members.length}/{guild?.max_members}</span>
            <span>🏭 {guild?.workshop_count} 工坊</span>
          </div>
        </div>
        <div className="guild-actions">
          {!isLeader && (
            <button className="leave-btn" onClick={handleLeave}>
              退出公会
            </button>
          )}
        </div>
      </div>

      <div className="guild-content">
        <div className="main-section">
          <div className="tower-section">
            <h3>🗼 共鸣塔</h3>
            <div className="tower-card">
              <div className="tower-icon">
                <div className="tower-level">Lv.{tower?.level || 1}</div>
              </div>
              <div className="tower-bonuses">
                <div className="bonus-item">
                  <span>范围加成</span>
                  <span className="positive">+{Math.floor((tower?.range_bonus || 0) * 100)}%</span>
                </div>
                <div className="bonus-item">
                  <span>精度加成</span>
                  <span className="positive">+{Math.floor((tower?.precision_bonus || 0) * 100)}%</span>
                </div>
                <div className="bonus-item">
                  <span>成功率加成</span>
                  <span className="positive">+{Math.floor((tower?.success_rate_bonus || 0) * 100)}%</span>
                </div>
              </div>
              {isLeader && (
                <button 
                  className="upgrade-tower-btn"
                  onClick={handleUpgradeTower}
                >
                  升级共鸣塔
                </button>
              )}
            </div>
          </div>

          <div className="guild-bonuses">
            <h3>✨ 公会加成</h3>
            <div className="bonus-grid">
              <div className="bonus-card">
                <span className="bonus-icon">🔧</span>
                <span className="bonus-value">+{Math.floor((guild?.craft_success_bonus || 0) * 100)}%</span>
                <span className="bonus-label">制作成功率</span>
              </div>
              <div className="bonus-card">
                <span className="bonus-icon">🔍</span>
                <span className="bonus-value">+{Math.floor((guild?.detection_bonus || 0) * 100)}%</span>
                <span className="bonus-label">探测属性</span>
              </div>
            </div>
          </div>

          <div className="contribute-section">
            <h3>💎 贡献</h3>
            <div className="contribute-card">
              <div className="my-contribution">
                <span>我的贡献</span>
                <span className="contrib-value">
                  {members.find((m: any) => m.player_id === player?.id)?.contribution || 0}
                </span>
              </div>
              <div className="contribute-input">
                <input
                  type="number"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  min="1"
                />
                <button onClick={handleContribute}>
                  捐献金币
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="members-section">
          <h3>👥 成员列表</h3>
          <div className="members-list">
            {members.map((member: any, index: number) => (
              <div key={member.id} className="member-item">
                <span className="member-rank">#{index + 1}</span>
                <div className="member-avatar">
                  {member.nickname?.[0] || '?'}
                </div>
                <div className="member-info">
                  <span className="member-name">
                    {member.nickname}
                    {member.role === 'leader' && <span className="leader-badge">会长</span>}
                  </span>
                  <span className="member-level">Lv.{member.level}</span>
                </div>
                <span className="member-contrib">{member.contribution}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Guild;
