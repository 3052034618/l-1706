const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');

const { initDatabase } = require('./db/database');
const { initRedis } = require('./db/redis');
const { initScheduler } = require('./scheduler');
const { GameEngine } = require('./engine/GameEngine');

const authRoutes = require('./routes/auth');
const workshopRoutes = require('./routes/workshop');
const craftingRoutes = require('./routes/crafting');
const contestRoutes = require('./routes/contest');
const marketRoutes = require('./routes/market');
const guildRoutes = require('./routes/guild');
const reportRoutes = require('./routes/report');
const leaderboardRoutes = require('./routes/leaderboard');

const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/workshop', workshopRoutes);
app.use('/api/crafting', craftingRoutes);
app.use('/api/contest', contestRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/guild', guildRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await initDatabase();
    await initRedis();
    
    const gameEngine = new GameEngine();
    await gameEngine.init();
    
    craftingRoutes.setGameEngine(gameEngine);
    contestRoutes.setGameEngine(gameEngine);
    marketRoutes.setGameEngine(gameEngine);
    reportRoutes.setGameEngine(gameEngine);
    leaderboardRoutes.setGameEngine(gameEngine);
    
    setupSocket(io, gameEngine);
    
    initScheduler(gameEngine);
    
    server.listen(PORT, () => {
      console.log(`\n🚀 回声工坊服务已启动`);
      console.log(`   API 服务: http://localhost:${PORT}`);
      console.log(`   WebSocket: ws://localhost:${PORT}`);
      console.log(`   时间: ${new Date().toLocaleString('zh-CN')}\n`);
    });
  } catch (error) {
    console.error('服务启动失败:', error);
    process.exit(1);
  }
}

startServer();
