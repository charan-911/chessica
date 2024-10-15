const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const Chess = require('chess.js').Chess;
const { RtcTokenBuilder, RtcRole } = require('agora-access-token'); // Agora Token SDK

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Agora credentials
const APP_ID = '98b6caaeb68f4a7b92704c67e7b63350';  
const APP_CERTIFICATE = '3fc1dc854f9e4a1682d4af525d3fd1fa';  

// Function to generate a unique channel name for each game session
const generateGameChannel = () => `game_${Math.random().toString(36).substr(2, 9)}`;

let onlineUsers = 0;
let waitingUsers = [];

// Token generation function
const generateAgoraToken = (channelName, uid) => {
  const role = RtcRole.PUBLISHER; 
  const expirationTimeInSeconds = 3600; 
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  // Generate the token
  return RtcTokenBuilder.buildTokenWithUid(
    APP_ID, APP_CERTIFICATE, channelName, uid, role, privilegeExpiredTs
  );
};

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

  socket.on('play', async () => {
    if (waitingUsers.length > 0) {
      const partner = waitingUsers.pop();
      socket.partner = partner;
      partner.partner = socket;

      // Create a new chess game for the paired users
      const chess = new Chess();
      socket.chess = chess;
      partner.chess = chess;

      // Generate a unique channel name for the Agora session
      const gameChannelName = generateGameChannel();
      console.log(`Generated Agora Channel Name: ${gameChannelName}`); // Log channel name

      try {
        // Request Agora token from the new token generation endpoint
        const token = generateAgoraToken(gameChannelName, 0); 

        // Notify both players they are paired and pass the Agora details
        socket.emit('paired', { initiator: true, channelName: gameChannelName, token });
        partner.emit('paired', { initiator: false, channelName: gameChannelName, token });
        console.log(`Sent Agora channel and token to both players: ${gameChannelName}`); // Log when sent

      } catch (error) {
        console.error("Error generating Agora token:", error);
        socket.emit('error', "Failed to generate Agora token.");
        partner.emit('error', "Failed to generate Agora token.");
      }
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

// New route to generate Agora token dynamically
app.get('/agora-token', (req, res) => {
  const { channelName } = req.query;

  if (!channelName) {
    return res.status(400).json({ error: "Channel name is required" });
  }

  // Generate Agora token for the requested channel
  const token = generateAgoraToken(channelName, 0); // uid = 0 to let Agora assign one

  res.json({ token });
});

app.get('/count', (req, res) => {
  res.json({ count: onlineUsers });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
