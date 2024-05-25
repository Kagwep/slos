const express = require('express');
const { Server } = require("socket.io");
const { v4: uuidV4 } = require('uuid');
const http = require('http');
const cors = require('cors');

const app = express(); // initialize express
app.use(cors());

const server = http.createServer(app);


// set port to value received from environment variable or 8080 if null
const port = process.env.PORT || 8080 

// upgrade http server to websocket server
const io = new Server(server, {
  cors: '*', // allow connection from any origin
});

const rooms = new Map();

// io.on('connection');
io.on('connection', (socket) => {

  console.log(socket.id, 'connected');

  // socket.on('username')
  socket.on('username', (username) => {
    console.log(username);  
    socket.data.username = username;
  });
  // createRoom
  socket.on('createRoom', async (roomId, tokenUris, callback) => {
    if (!rooms.has(roomId)) {
        await socket.join(roomId);
        rooms.set(roomId, {
            roomId,
            players: [{ id: socket.id, username: socket.data?.username }],
            tokenUris: tokenUris // Storing the token URIs here
        });

        callback({ success: true, roomId: roomId, tokenUris: tokenUris, message: "Room created successfully." });
    } else {
        callback({ success: false, roomId: null, message: "Room ID already in use." });
    }
});


socket.on('joinRoom', async (args, callback) => {
  const room = rooms.get(args.roomId);
  if (!room) {
      callback({ error: true, message: 'Room does not exist' });
      return;
  }

  if (room.players.length >= 2) {
      callback({ error: true, message: 'Room is full' });
      return;
  }

  await socket.join(args.roomId);
  room.players.push({ id: socket.id, username: socket.data?.username, tokenUris: args.banners });

  // Here, send back to the joining player the opponent's banners and vice versa
  const opponentTokenUris = room.tokenUris; // assuming the first player is already in the room
  callback({ roomId: args.roomId, players: room.players, opponentTokenUris: opponentTokenUris, error: false });

  // Notify the first player that a new opponent has joined and send them the new player's banners
  socket.to(args.roomId).emit('opponentJoined', { newPlayerTokenUris: args.banners, players: room.players });
});


    socket.on('move', (data) => {
      // emit to all sockets in the room except the emitting socket.
      socket.to(data.room).emit('move', data.move);
    });


    socket.on('gameStartState', (data) => {
      // emit to all sockets in the room except the emitting socket.
      socket.to(data.room).emit('gameStartState', data.gameStartState);
    });

    socket.on('turnChange', (data) => {
      // emit to all sockets in the room except the emitting socket.
      socket.to(data.room).emit('turnChange', data.turnChange);
    });

    socket.on("disconnect", () => {
      const gameRooms = Array.from(rooms.values()); // <- 1
  
      gameRooms.forEach((room) => { // <- 2
        const userInRoom = room.players.find((player) => player.id === socket.id); // <- 3
  
        if (userInRoom) {
          if (room.players.length < 2) {
            // if there's only 1 player in the room, close it and exit.
            rooms.delete(room.roomId);
            return;
          }
  
          socket.to(room.roomId).emit("playerDisconnected", userInRoom); // <- 4
        }
      });
    });

    socket.on("closeRoom", async (data) => {
      socket.to(data.roomId).emit("closeRoom", data); // <- 1 inform others in the room that the room is closing
  
      const clientSockets = await io.in(data.roomId).fetchSockets(); // <- 2 get all sockets in a room
  
      // loop over each socket client
      clientSockets.forEach((s) => {
        s.leave(data.roomId); // <- 3 and make them leave the room on socket.io
      });
  
      rooms.delete(data.roomId); // <- 4 delete room from rooms map
    });

  });

server.listen(port, () => {
  console.log(`listening on *:${port}`);
});