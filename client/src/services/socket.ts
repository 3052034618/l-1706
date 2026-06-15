import { io, Socket } from 'socket.io-client';
import { store } from '../store';
import { completeCrafting } from '../store/slices/craftingSlice';
import { updateScore, updateStandings, addBuff } from '../store/slices/contestSlice';

let socket: Socket | null = null;

export const initSocket = () => {
  const socketUrl = process.env.REACT_APP_SOCKET_URL || 'http://localhost:4000';
  const token = localStorage.getItem('token');
  
  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('✅ 已连接到服务器');
    const playerId = store.getState().player.data?.id;
    if (playerId) {
      socket?.emit('login', playerId);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ 与服务器断开连接');
  });

  socket.on('crafting_complete', (data: any) => {
    console.log('🔨 制作完成:', data);
    store.dispatch(completeCrafting(data));
  });

  socket.on('score_update', (data: any) => {
    store.dispatch(updateScore(data));
  });

  socket.on('contest_update', (data: any) => {
    console.log('🏆 大赛更新:', data);
    store.dispatch(updateStandings(data.standings));
    
    const state = store.getState();
    const userEntryId = state.contest.userEntry?.id;
    const userStanding = data.standings.find((s: any) => s.id === userEntryId);
    if (userStanding) {
      store.dispatch(updateScore({
        entryId: userEntryId,
        score: userStanding.score,
        intensity: userStanding.current_intensity
      }));
    }
  });

  socket.on('skill_used', (data: any) => {
    console.log('⚡ 技能使用:', data);
  });

  socket.on('contest_started', (data: any) => {
    console.log('🏆 大赛开始:', data);
  });

  socket.on('contest_ended', (data: any) => {
    console.log('🏆 大赛结束:', data);
  });

  socket.on('sound_tide', (data: any) => {
    console.log('🌊 声波潮汐:', data);
  });

  socket.on('market_sold', (data: any) => {
    console.log('💰 交易成功:', data);
  });

  return socket;
};

export const getSocket = () => socket;

export const joinContestRoom = (contestId: string) => {
  socket?.emit('join_contest', contestId);
};

export const leaveContestRoom = (contestId: string) => {
  socket?.emit('leave_contest', contestId);
};

export const sendChatMessage = (channel: string, message: string, userId: string, nickname: string) => {
  socket?.emit('send_chat', { channel, message, userId, nickname });
};

export default socket;
