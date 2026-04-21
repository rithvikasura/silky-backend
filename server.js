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
            memberNames: [{ id: socket.id, name: userId }],
            messages: [],
            currentVideoId: null
        });
        socket.join(groupId);
        socket.emit('group-created', groupId);
        
        // Send online users list (just self)
        socket.emit('online-users', [userId]);
    });
    
    socket.on('join-group', ({ groupId, userId }) => {
        if (!groups.has(groupId)) { socket.emit('error-msg', 'Group not found'); return; }
        const group = groups.get(groupId);
        group.members.push(socket.id);
        group.memberNames.push({ id: socket.id, name: userId });
        socket.join(groupId);
        socket.emit('joined-group', groupId);
        socket.emit('old-messages', group.messages);
        
        // Send current playing song to new user
        if (group.currentVideoId) {
            socket.emit('sync-video', { videoId: group.currentVideoId });
        }
        
        // Send updated online users list to everyone
        const onlineUsers = group.memberNames.map(m => m.name);
        io.to(groupId).emit('online-users', onlineUsers);
        socket.to(groupId).emit('user-joined', userId);
        
        const isAdmin = group.admin === socket.id;
        socket.emit('admin-status', isAdmin);
    });
    
    socket.on('leave-group', ({ groupId, userId }) => {
        const group = groups.get(groupId);
        if (group) {
            const index = group.members.indexOf(socket.id);
            if (index !== -1) group.members.splice(index, 1);
            const nameIndex = group.memberNames.findIndex(m => m.id === socket.id);
            if (nameIndex !== -1) group.memberNames.splice(nameIndex, 1);
            socket.leave(groupId);
            
            // Update online users list
            const onlineUsers = group.memberNames.map(m => m.name);
            io.to(groupId).emit('online-users', onlineUsers);
            socket.to(groupId).emit('user-left', { user: userId });
        }
    });
    
    socket.on('close-group', ({ groupId }) => {
        io.to(groupId).emit('group-closed');
        groups.delete(groupId);
    });
    
    socket.on('rename-user', ({ groupId, oldName, newName }) => {
        const group = groups.get(groupId);
        if (group) {
            const member = group.memberNames.find(m => m.name === oldName);
            if (member) member.name = newName;
            const onlineUsers = group.memberNames.map(m => m.name);
            io.to(groupId).emit('online-users', onlineUsers);
            socket.to(groupId).emit('user-renamed', { oldName, newName });
        }
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
            // Update online users
            const onlineUsers = group.memberNames.map(m => m.name);
            io.to(groupId).emit('online-users', onlineUsers);
        }
    });
    
    socket.on('disconnect', () => { 
        console.log('User disconnected:', socket.id);
        // Remove from any group
        for (let [groupId, group] of groups.entries()) {
            const index = group.members.indexOf(socket.id);
            if (index !== -1) {
                group.members.splice(index, 1);
                const nameIndex = group.memberNames.findIndex(m => m.id === socket.id);
                if (nameIndex !== -1) group.memberNames.splice(nameIndex, 1);
                const onlineUsers = group.memberNames.map(m => m.name);
                io.to(groupId).emit('online-users', onlineUsers);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
