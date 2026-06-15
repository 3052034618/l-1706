import React, { useEffect, useState } from 'react';
import api from '../services/api';
import './Leaderboard.scss';

const Leaderboard: React.FC = () => {
  const [activeType, setActiveType] = useState<'collection' | 'contest' | 'guild'>('collection');
  const [rankings, setRankings] = useState<any[]>([]);
  const [myRank, setMyRank] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRankings();
    fetchMyRank();
  }, [activeType]);

  const fetchRankings = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/leaderboard/${activeType}`);
      setRankings(response.data.rankings);
    } catch (error) {
      console.error('获取排行榜失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRank = async () => {
    try {
      const response = await api.get('/leaderboard/me/rank');
      setMyRank(response.data);
    } catch (error) {
      console.error('获取我的排名失败:', error);
    }
  };

  const typeLabels = {
    collection: '收藏度',
    contest: '大赛积分',
    guild: '公会贡献'
  };

  return (
    <div className="leaderboard-page">
      <div className="page-header">
        <h2>🏆 全服排行榜</h2>
        <p>每周更新，看看谁是最强回声师！</p>
      </div>

      <div className="tab-switcher">
        {(['collection', 'contest', 'guild'] as const).map((type) => (
          <button
            key={type}
            className={`tab-btn ${activeType === type ? 'active' : ''}`}
            onClick={() => setActiveType(type)}
          >
            {typeLabels[type]}
          </button>
        ))}
      </div>

      {myRank && activeType !== 'guild' && (
        <div className="my-rank-card">
          <div className="mr-label">我的排名</div>
          <div className="mr-rank">
            #{myRank[activeType === 'collection' ? 'collection' : 'contest']?.rank || '-'}
          </div>
          <div className="mr-score">
            {myRank[activeType === 'collection' ? 'collection' : 'contest']?.score || 0} 分
          </div>
          <div className="mr-total">
            共 {myRank[activeType === 'collection' ? 'collection' : 'contest']?.total || 0} 人
          </div>
        </div>
      )}

      <div className="top-three">
        {rankings.slice(0, 3).map((item, index) => (
          <div key={item.id} className={`top-card rank-${index + 1}`}>
            <div className="top-rank">
              {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
            </div>
            <div className="top-avatar">
              {item.nickname?.[0] || item.name?.[0] || '?'}
            </div>
            <div className="top-name">{item.nickname || item.name}</div>
            <div className="top-score">
              {activeType === 'guild' 
                ? (item.total_contribution || 0).toLocaleString()
                : (activeType === 'collection' ? item.collection_score : item.contest_points)?.toLocaleString() || 0}
            </div>
            <div className="top-label">
              {typeLabels[activeType]}
            </div>
          </div>
        ))}
      </div>

      <div className="rankings-list">
        {rankings.slice(3).map((item, index) => (
          <div key={item.id} className="ranking-item">
            <span className="rank-number">#{index + 4}</span>
            <div className="rank-avatar">
              {item.nickname?.[0] || item.name?.[0] || '?'}
            </div>
            <div className="rank-info">
              <span className="rank-name">{item.nickname || item.name}</span>
              {activeType !== 'guild' && (
                <span className="rank-level">Lv.{item.level}</span>
              )}
              {activeType === 'guild' && (
                <span className="rank-level">{item.member_count || 0} 成员</span>
              )}
            </div>
            <span className="rank-score">
              {activeType === 'guild'
                ? (item.total_contribution || 0).toLocaleString()
                : (activeType === 'collection' ? item.collection_score : item.contest_points)?.toLocaleString() || 0}
            </span>
          </div>
        ))}

        {rankings.length === 0 && !loading && (
          <div className="empty-state">
            暂无排行数据
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
