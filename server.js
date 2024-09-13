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
  });

  socket.on('play', () => {
    if (waitingUsers.length > 0) {
      const partner = waitingUsers.pop();
      socket.partner = partner;
      partner.partner = socket;

      const chess = new Chess();
      socket.chess = chess;
      partner.chess = chess;

      socket.emit('paired', { initiator: true });
      partner.emit('paired', { initiator: false });
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
