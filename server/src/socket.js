const { cacheDel } = require('./db/redis');

function setupSocket(io, gameEngine) {
  global.io = io;

  io.on('connection', (socket) => {
    console.log(`🔌 新连接: ${socket.id}`);

    socket.on('login', (userId) => {
      socket.join(`player_${userId}`);
      gameEngine.onlinePlayers.add(userId);
      console.log(`👤 用户 ${userId} 上线, 当前在线: ${gameEngine.onlinePlayers.size}`);
    });

    socket.on('join_contest', (contestId) => {
      socket.join(`contest_${contestId}`);
    });

    socket.on('leave_contest', (contestId) => {
      socket.leave(`contest_${contestId}`);
    });

    socket.on('send_chat', (data) => {
      const { channel, message, userId, nickname } = data;
      io.to(channel).emit('chat_message', {
        userId,
        nickname,
        message,
        timestamp: Date.now()
      });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 断开连接: ${socket.id}`);
    });
  });

  console.log('✅ Socket.IO 已初始化');
}

function broadcastCraftingComplete(playerId, data) {
  if (global.io) {
    global.io.to(`player_${playerId}`).emit('crafting_complete', data);
  }
}

function broadcastContestUpdate(contestId, data) {
  if (global.io) {
    global.io.to(`contest_${contestId}`).emit('contest_update', data);
  }
}

function broadcastMarketUpdate(data) {
  if (global.io) {
    global.io.emit('market_update', data);
  }
}

function broadcastSoundTide(data) {
  if (global.io) {
    global.io.emit('sound_tide', data);
  }
}

module.exports = {
  setupSocket,
  broadcastCraftingComplete,
  broadcastContestUpdate,
  broadcastMarketUpdate,
  broadcastSoundTide
};
