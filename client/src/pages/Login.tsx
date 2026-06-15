import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { login, register } from '../store/slices/playerSlice';
import './Login.scss';

const Login: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state: RootState) => state.player);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLogin) {
      dispatch(login({ username, password }) as any).then((result: any) => {
        if (result.meta.requestStatus === 'fulfilled') {
          navigate('/');
        }
      });
    } else {
      dispatch(register({ username, password, nickname }) as any).then((result: any) => {
        if (result.meta.requestStatus === 'fulfilled') {
          navigate('/');
        }
      });
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="bg-glow glow-1"></div>
        <div className="bg-glow glow-2"></div>
        <div className="bg-glow glow-3"></div>
      </div>
      
      <div className="login-container">
        <div className="login-header">
          <div className="logo-big">🔮</div>
          <h1 className="login-title">回声工坊</h1>
          <p className="login-subtitle">探索声波的奥秘，打造传奇探测器</p>
        </div>
        
        <div className="tab-switcher">
          <button 
            className={`tab-btn ${isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(true)}
          >
            登录
          </button>
          <button 
            className={`tab-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(false)}
          >
            注册
          </button>
        </div>
        
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
            />
          </div>
          
          {!isLogin && (
            <div className="form-group">
              <label>昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="请输入昵称"
              />
            </div>
          )}
          
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button 
            type="submit" 
            className="submit-btn"
            disabled={loading}
          >
            {loading ? '处理中...' : (isLogin ? '登 录' : '注 册')}
          </button>
        </form>
        
        <div className="login-footer">
          <p>
            {isLogin ? '还没有账号？' : '已有账号？'}
            <span onClick={() => setIsLogin(!isLogin)} className="switch-link">
              {isLogin ? '立即注册' : '立即登录'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
