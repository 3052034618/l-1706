import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchWorkshop, createWorkshop, upgradeWorkshop, recruitEchosmith, promoteEchosmith } from '../store/slices/workshopSlice';
import './Workshop.scss';

const Workshop: React.FC = () => {
  const dispatch = useDispatch();
  const { workshop, echosmiths, loading } = useSelector((state: RootState) => state.workshop);
  const { data: player } = useSelector((state: RootState) => state.player);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [workshopName, setWorkshopName] = useState('');
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [recruitName, setRecruitName] = useState('');

  useEffect(() => {
    dispatch(fetchWorkshop() as any);
  }, [dispatch]);

  const handleCreate = () => {
    if (!workshopName.trim()) return;
    dispatch(createWorkshop(workshopName) as any).then(() => {
      setShowCreateModal(false);
      dispatch(fetchWorkshop() as any);
    });
  };

  const handleUpgrade = () => {
    dispatch(upgradeWorkshop() as any).then(() => {
      dispatch(fetchWorkshop() as any);
    });
  };

  const handleRecruit = () => {
    dispatch(recruitEchosmith(recruitName || '新回声师') as any).then(() => {
      setShowRecruitModal(false);
      setRecruitName('');
      dispatch(fetchWorkshop() as any);
    });
  };

  const handlePromote = (id: string, skillType: string) => {
    dispatch(promoteEchosmith({ id, skillType }) as any).then(() => {
      dispatch(fetchWorkshop() as any);
    });
  };

  if (!workshop) {
    return (
      <div className="workshop-page no-workshop">
        <div className="no-workshop-card">
          <div className="nw-icon">🏭</div>
          <h2>还没有自己的工坊</h2>
          <p>创建回声工坊，招募回声师，开始你的声波探险之旅！</p>
          <button className="create-btn" onClick={() => setShowCreateModal(true)}>
            创建工坊
          </button>
        </div>
        
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>创建回声工坊</h3>
              <input
                type="text"
                placeholder="请输入工坊名称"
                value={workshopName}
                onChange={(e) => setWorkshopName(e.target.value)}
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

  const isOwner = workshop.owner_id === player?.id;
  const upgradeCost = workshop.level * 500;

  return (
    <div className="workshop-page">
      <div className="workshop-header">
        <div className="workshop-info">
          <h2>🏭 {workshop.name}</h2>
          <div className="workshop-stats">
            <span className="stat">Lv.{workshop.level}</span>
            <span className="stat">👥 {echosmiths.length}/{workshop.max_members}</span>
            <span className="stat">⚡ +{Math.floor(workshop.crafting_speed_bonus * 100)}% 速度</span>
            <span className="stat">✨ +{Math.floor(workshop.quality_bonus * 100)}% 品质</span>
          </div>
        </div>
        {isOwner && (
          <button 
            className="upgrade-btn"
            onClick={handleUpgrade}
            disabled={player?.gold < upgradeCost}
          >
            升级工坊 ({upgradeCost} 金币)
          </button>
        )}
      </div>

      <div className="workshop-content">
        <div className="members-section">
          <div className="section-header">
            <h3>👨‍🔬 回声师成员</h3>
            {isOwner && echosmiths.length < workshop.max_members && (
              <button 
                className="recruit-btn"
                onClick={() => setShowRecruitModal(true)}
              >
                + 招募
              </button>
            )}
          </div>
          
          <div className="echosmiths-grid">
            {echosmiths.map((es: any) => (
              <div key={es.id} className="echosmith-card">
                <div className="es-header">
                  <div className="es-avatar">
                    {es.name[0]}
                  </div>
                  <div className="es-info">
                    <h4>
                      {es.name}
                      {es.is_chief && <span className="chief-badge">首席</span>}
                    </h4>
                    <span className="es-role">{es.role === 'chief' ? '首席回声师' : '成员'}</span>
                  </div>
                </div>
                
                <div className="es-level">
                  <span>等级 Lv.{es.level}</span>
                  <div className="exp-bar">
                    <div className="exp-fill" style={{ width: `${(es.exp || 0) % 100}%` }}></div>
                  </div>
                </div>
                
                <div className="es-skills">
                  <div className="skill-item">
                    <span className="skill-icon">👂</span>
                    <span className="skill-name">听力</span>
                    <span className="skill-level">Lv.{es.hearing_skill}</span>
                    {isOwner && !es.is_chief && (
                      <button 
                        className="skill-up-btn"
                        onClick={() => handlePromote(es.id, 'hearing')}
                      >
                        ↑
                      </button>
                    )}
                  </div>
                  <div className="skill-item">
                    <span className="skill-icon">🎚</span>
                    <span className="skill-name">调制</span>
                    <span className="skill-level">Lv.{es.modulation_skill}</span>
                    {isOwner && !es.is_chief && (
                      <button 
                        className="skill-up-btn"
                        onClick={() => handlePromote(es.id, 'modulation')}
                      >
                        ↑
                      </button>
                    )}
                  </div>
                  <div className="skill-item">
                    <span className="skill-icon">🔍</span>
                    <span className="skill-name">探测</span>
                    <span className="skill-level">Lv.{es.detection_skill}</span>
                    {isOwner && !es.is_chief && (
                      <button 
                        className="skill-up-btn"
                        onClick={() => handlePromote(es.id, 'detection')}
                      >
                        ↑
                      </button>
                    )}
                  </div>
                </div>
                
                {isOwner && (
                  <div className="es-footer">
                    <span className="hire-cost">
                      招募花费: {es.hire_cost || 200} 金币
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="workshop-details">
          <div className="detail-card">
            <h4>🏭 工坊加成</h4>
            <div className="bonus-list">
              <div className="bonus-item">
                <span>制作速度</span>
                <span className="bonus-value positive">+{Math.floor(workshop.crafting_speed_bonus * 100)}%</span>
              </div>
              <div className="bonus-item">
                <span>品质加成</span>
                <span className="bonus-value positive">+{Math.floor(workshop.quality_bonus * 100)}%</span>
              </div>
              <div className="bonus-item">
                <span>最大成员</span>
                <span className="bonus-value">{workshop.max_members}人</span>
              </div>
            </div>
          </div>
          
          <div className="detail-card">
            <h4>📊 工坊信息</h4>
            <div className="info-list">
              <div className="info-item">
                <span>馆长</span>
                <span>{player?.nickname}</span>
              </div>
              <div className="info-item">
                <span>创建时间</span>
                <span>{new Date(workshop.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRecruitModal && (
        <div className="modal-overlay" onClick={() => setShowRecruitModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>招募回声师</h3>
            <p className="modal-desc">花费 200 金币招募一名新回声师</p>
            <input
              type="text"
              placeholder="请输入回声师名称（可选）"
              value={recruitName}
              onChange={(e) => setRecruitName(e.target.value)}
            />
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowRecruitModal(false)}>取消</button>
              <button className="confirm-btn" onClick={handleRecruit}>招募 (200金币)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workshop;
