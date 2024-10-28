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

// Function to generate a unique channel name for each game session
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

    // If the user was waiting for an opponent, remove from waitingUsers
    waitingUsers = waitingUsers.filter(user => user !== socket);

    // If the user was in a game, notify their opponent
    if (socket.partner) {
      socket.partner.emit('opponentLeft'); // Notify the opponent
      socket.partner.partner = null; // Remove the reference to the disconnected partner
    }
  });

  socket.on('play', () => {
    if (waitingUsers.length > 0) {
      const partner = waitingUsers.pop();
      socket.partner = partner;
      partner.partner = socket;

      // Create a new chess game for the paired users
      const chess = new Chess();
      socket.chess = chess;
      partner.chess = chess;

      // Notify both players they are paired
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

  socket.on('move', (move) => {
    if (socket.chess && socket.chess.move(move)) {
      socket.partner.emit('move', move);
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
