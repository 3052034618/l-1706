import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchPlayerData, logout } from '../store/slices/playerSlice';
import { initSocket } from '../services/socket';
import './Layout.scss';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { data: player } = useSelector((state: RootState) => state.player);

  useEffect(() => {
    dispatch(fetchPlayerData() as any);
    initSocket();
  }, [dispatch]);

  const menuItems = [
    { path: '/', icon: '🏠', label: '首页' },
    { path: '/workshop', icon: '🏭', label: '回声工坊' },
    { path: '/crafting', icon: '🔧', label: '制作台' },
    { path: '/contest', icon: '🏆', label: '回声大赛' },
    { path: '/market', icon: '💰', label: '交易市场' },
    { path: '/guild', icon: '🏰', label: '公会' },
    { path: '/leaderboard', icon: '🏅', label: '排行榜' },
    { path: '/report', icon: '📊', label: '产业报告' }
  ];

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">🔮</span>
          <span className="logo-text">回声工坊</span>
        </div>
        
        <nav className="nav-menu">
          {menuItems.map((item) => (
            <div
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {player?.nickname?.[0] || '?'}
            </div>
            <div className="user-details">
              <div className="user-name">{player?.nickname || player?.username}</div>
              <div className="user-level">Lv.{player?.level || 1}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            退出
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">
              {menuItems.find(m => m.path === location.pathname)?.label || '回声工坊'}
            </h1>
          </div>
          <div className="topbar-right">
            <div className="currency">
              <span className="currency-icon">💰</span>
              <span className="currency-value">{player?.gold?.toLocaleString() || 0}</span>
            </div>
            <div className="currency">
              <span className="currency-icon">💎</span>
              <span className="currency-value">{player?.crystals || 0}</span>
            </div>
          </div>
        </header>

        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
