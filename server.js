const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
cors: { origin: "*" }
});

let groups = {};

io.on("connection", (socket) => {

socket.on("create-group", ({ userId }) => {
const groupId = Math.random().toString(36).substring(2,8);

groups[groupId] = {
  admin: socket.id,
  isOpen: true,
  users: [userId],
  videoId: null
};

socket.join(groupId);
socket.emit("group-created", groupId);

});

socket.on("join-group", ({ groupId, userId }) => {
const group = groups[groupId];

if (!group) return socket.emit("error-msg", "Group not found");

if (!group.isOpen && socket.id !== group.admin) {
  return socket.emit("error-msg", "Group Locked 🔒");
}

socket.join(groupId);
group.users.push(userId);

socket.emit("joined-group", groupId);

if (group.videoId) {
  socket.emit("sync-video", { videoId: group.videoId });
}

});

socket.on("play-video", ({ groupId, videoId }) => {
const group = groups[groupId];
if (!group) return;

if (socket.id !== group.admin) return;

group.videoId = videoId;

io.to(groupId).emit("sync-video", { videoId });

});

socket.on("toggle-lock", ({ groupId }) => {
const group = groups[groupId];
if (!group) return;

if (socket.id !== group.admin) return;

group.isOpen = !group.isOpen;

io.to(groupId).emit("lock-status", group.isOpen);

});

socket.on("send-message", ({ groupId, msg }) => {
io.to(groupId).emit("new-message", msg);
});

});

server.listen(3000, () => console.log("Server running"));
