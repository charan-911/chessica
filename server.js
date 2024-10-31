const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const Chess = require('chess.js').Chess;

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const generateGameChannel = () => `game_${Math.random().toString(36).substr(2, 9)}`;

let onlineUsers = 0;
let waitingUsers = [];

io.on('connection', (socket) => {
  onlineUsers++;
  console.log(`A user connected. Total users online: ${onlineUsers}`);
  io.emit('updateCount', onlineUsers);

  socket.on('disconnect', () => {
    onlineUsers--;
    console.log(`A user disconnected. Total users online: ${onlineUsers}`);
    io.emit('updateCount', onlineUsers);

    waitingUsers = waitingUsers.filter(user => user !== socket);

    if (socket.partner) {
      socket.partner.emit('opponentLeft');
      socket.partner.partner = null;
    }
  });

  socket.on('play', () => {
    if (waitingUsers.length > 0) {
      const partner = waitingUsers.pop();
      socket.partner = partner;
      partner.partner = socket;

      const chess = new Chess();
      socket.chess = chess;
      partner.chess = chess;

      socket.emit('paired', { initiator: true, channelName: generateGameChannel() });
      partner.emit('paired', { initiator: false, channelName: generateGameChannel() });
      console.log('Both players have been paired.');
    } else {
      waitingUsers.push(socket);
    }
  });

  socket.on('signal', (data) => {
    if (socket.partner) {
      socket.partner.emit('signal', data);
    }
  });

  socket.on('move', (move, callback) => {
    if (socket.chess && socket.chess.move(move)) {
      console.log(`Move received: ${JSON.stringify(move)}`);
      
      const sendMoveToOpponent = (move, retries = 10) => {
        if (retries <= 0) {
          console.log("Failed to send move to opponent after multiple attempts.");
          return;
        }

        socket.partner.emit('move', move, (ack) => {
          if (!ack || !ack.success) {
            setTimeout(() => sendMoveToOpponent(move, retries - 1), 500);
          } else {
            console.log('Move acknowledged by opponent.');
          }
        });
      };

      sendMoveToOpponent(move);

      if (callback) {
        callback({ success: true });
      }
    }
  });
});

app.get('/count', (req, res) => {
  res.json({ count: onlineUsers });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
