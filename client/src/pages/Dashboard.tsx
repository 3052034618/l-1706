import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchPlayerData } from '../store/slices/playerSlice';
import './Dashboard.scss';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { data: player } = useSelector((state: RootState) => state.player);

  useEffect(() => {
    dispatch(fetchPlayerData() as any);
  }, [dispatch]);

  const quickActions = [
    { icon: '🔧', title: '制作探测器', desc: '使用材料制作声波探测器', path: '/crafting', color: '#3498db' },
    { icon: '🏆', title: '回声大赛', desc: '参与每日大赛赢取奖励', path: '/contest', color: '#e74c3c' },
    { icon: '💰', title: '交易市场', desc: '买卖材料和探测器', path: '/market', color: '#f39c12' },
    { icon: '🏭', title: '回声工坊', desc: '管理工坊与回声师', path: '/workshop', color: '#9b59b6' }
  ];

  const stats = [
    { label: '等级', value: player?.level || 1, icon: '⭐' },
    { label: '金币', value: (player?.gold || 0).toLocaleString(), icon: '💰' },
    { label: '水晶', value: player?.crystals || 0, icon: '💎' },
    { label: '大赛积分', value: player?.contest_points || 0, icon: '🏆' }
  ];

  return (
    <div className="dashboard">
      <div className="welcome-section">
        <div className="welcome-text">
          <h2>欢迎回来，{player?.nickname || player?.username} 👋</h2>
          <p>今天也要探索声波的奥秘哦！</p>
        </div>
        <div className="stats-cards">
          {stats.map((stat, index) => (
            <div key={index} className="stat-card">
              <span className="stat-icon">{stat.icon}</span>
              <div className="stat-info">
                <span className="stat-value">{stat.value}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="quick-actions">
        <h3 className="section-title">快捷入口</h3>
        <div className="action-grid">
          {quickActions.map((action, index) => (
            <div
              key={index}
              className="action-card"
              style={{ '--accent-color': action.color } as React.CSSProperties}
              onClick={() => navigate(action.path)}
            >
              <div className="action-icon">{action.icon}</div>
              <div className="action-content">
                <h4>{action.title}</h4>
                <p>{action.desc}</p>
              </div>
              <div className="action-arrow">→</div>
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-bottom">
        <div className="panel">
          <h3 className="section-title">📢 今日活动</h3>
          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-dot"></span>
              <div className="activity-content">
                <span className="activity-title">每日回声大赛</span>
                <span className="activity-desc">10:00 - 22:00，参与赢取积分与稀有设计图</span>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-dot gold"></span>
              <div className="activity-content">
                <span className="activity-title">声波潮汐</span>
                <span className="activity-desc">交易火爆时触发，提升全服探测成功率</span>
              </div>
            </div>
            <div className="activity-item">
              <span className="activity-dot purple"></span>
              <div className="activity-content">
                <span className="activity-title">周末双倍</span>
                <span className="activity-desc">周末大赛积分双倍奖励</span>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <h3 className="section-title">💡 制作提示</h3>
          <div className="tips-list">
            <div className="tip-item">
              <span className="tip-icon">🎯</span>
              <p>高品质材料能制作出更好的探测器</p>
            </div>
            <div className="tip-item">
              <span className="tip-icon">👨‍🔬</span>
              <p>提升回声师技能可以增加词缀触发几率</p>
            </div>
            <div className="tip-item">
              <span className="tip-icon">✨</span>
              <p>传说级探测器有机会获得隐藏属性</p>
            </div>
            <div className="tip-item">
              <span className="tip-icon">🌊</span>
              <p>声波潮汐期间制作成功率会提升</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
