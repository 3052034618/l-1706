import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from './store';
import { fetchPlayerData } from './store/slices/playerSlice';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Workshop from './pages/Workshop';
import Crafting from './pages/Crafting';
import Contest from './pages/Contest';
import Market from './pages/Market';
import Guild from './pages/Guild';
import Leaderboard from './pages/Leaderboard';
import Report from './pages/Report';

const App: React.FC = () => {
  const dispatch = useDispatch();
  const { isLoggedIn } = useSelector((state: RootState) => state.player);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isLoggedIn) {
      dispatch(fetchPlayerData() as any);
    }
  }, [dispatch, isLoggedIn]);

  return (
    <Routes>
      <Route path="/login" element={!isLoggedIn ? <Login /> : <Navigate to="/" />} />
      <Route path="/" element={isLoggedIn ? <Layout /> : <Navigate to="/login" />}>
        <Route index element={<Dashboard />} />
        <Route path="workshop" element={<Workshop />} />
        <Route path="crafting" element={<Crafting />} />
        <Route path="contest" element={<Contest />} />
        <Route path="market" element={<Market />} />
        <Route path="guild" element={<Guild />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="report" element={<Report />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};

export default App;
