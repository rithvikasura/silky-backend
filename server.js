const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

let groups = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('create-group', ({ userId }) => {
        const groupId = Math.random().toString(36).substring(2, 8);
        groups.set(groupId, { 
            admin: socket.id, 
            adminName: userId, 
            members: [socket.id], 
            messages: [],
            currentVideoId: null
        });
        socket.join(groupId);
        socket.emit('group-created', groupId);
    });
    
    socket.on('join-group', ({ groupId, userId }) => {
        if (!groups.has(groupId)) { socket.emit('error-msg', 'Group not found'); return; }
        const group = groups.get(groupId);
        group.members.push(socket.id);
        socket.join(groupId);
        socket.emit('joined-group', groupId);
        socket.emit('old-messages', group.messages);
        
        // Send current playing song to new user
        if (group.currentVideoId) {
            socket.emit('sync-video', { videoId: group.currentVideoId });
        }
        
        socket.to(groupId).emit('user-joined', userId);
        const isAdmin = group.admin === socket.id;
        socket.emit('admin-status', isAdmin);
    });
    
    socket.on('leave-group', ({ groupId, userId }) => {
        socket.leave(groupId);
        socket.to(groupId).emit('user-left', { user: userId });
    });
    
    socket.on('close-group', ({ groupId }) => {
        io.to(groupId).emit('group-closed');
        groups.delete(groupId);
    });
    
    socket.on('rename-user', ({ groupId, oldName, newName }) => {
        socket.to(groupId).emit('user-renamed', { oldName, newName });
    });
    
    socket.on('play-video', ({ groupId, videoId }) => {
        const group = groups.get(groupId);
        if (group) {
            group.currentVideoId = videoId;
        }
        io.to(groupId).emit('sync-video', { videoId });
    });
    
    socket.on('send-message', ({ groupId, msg }) => {
        const group = groups.get(groupId);
        if (group) { 
            group.messages.push(msg); 
            if (group.messages.length > 100) group.messages.shift(); 
        }
        io.to(groupId).emit('new-message', msg);
    });
    
    socket.on('rejoin-group', ({ groupId, userId }) => {
        if (groups.has(groupId)) {
            socket.join(groupId);
            const group = groups.get(groupId);
            socket.emit('old-messages', group.messages);
            socket.emit('rejoin-success');
            const isAdmin = group.admin === socket.id;
            socket.emit('admin-status', isAdmin);
            if (group.currentVideoId) {
                socket.emit('sync-video', { videoId: group.currentVideoId });
            }
        }
    });
    
    socket.on('disconnect', () => { console.log('User disconnected:', socket.id); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
