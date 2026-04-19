const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

let groups = new Map(); // groupId -> { adminId, adminName, members: Map(socketId -> {userId, name}), messages }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-group', ({ userId }) => {
        const groupId = Math.random().toString(36).substring(2, 8);
        const members = new Map();
        members.set(socket.id, { userId, name: userId });
        groups.set(groupId, {
            adminId: socket.id,
            adminName: userId,
            members: members,
            messages: []
        });
        socket.join(groupId);
        socket.emit('group-created', groupId);
        // Send online list (just self)
        socket.emit('online-users', [{ userId, name: userId }]);
    });

    socket.on('join-group', ({ groupId, userId }) => {
        const group = groups.get(groupId);
        if (!group) {
            socket.emit('error-msg', 'Group not found');
            return;
        }
        group.members.set(socket.id, { userId, name: userId });
        socket.join(groupId);
        socket.emit('joined-group', groupId);
        // Send existing messages
        socket.emit('old-messages', group.messages);
        // Send current online users list to new user
        const onlineList = Array.from(group.members.values()).map(m => ({ userId: m.userId, name: m.name }));
        socket.emit('online-users', onlineList);
        // Notify others about new user
        socket.to(groupId).emit('user-joined', userId);
        // Update online list for everyone
        io.to(groupId).emit('online-users', onlineList);
        // Check admin status
        const isAdmin = group.adminId === socket.id;
        socket.emit('admin-status', isAdmin);
    });

    socket.on('leave-group', ({ groupId, userId }) => {
        const group = groups.get(groupId);
        if (group) {
            group.members.delete(socket.id);
            socket.leave(groupId);
            const onlineList = Array.from(group.members.values()).map(m => ({ userId: m.userId, name: m.name }));
            io.to(groupId).emit('online-users', onlineList);
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
            for (let [sid, member] of group.members.entries()) {
                if (member.name === oldName) member.name = newName;
            }
            group.messages = group.messages.map(msg => {
                if (msg.user === oldName) return { ...msg, user: newName };
                return msg;
            });
            const onlineList = Array.from(group.members.values()).map(m => ({ userId: m.userId, name: m.name }));
            io.to(groupId).emit('online-users', onlineList);
            socket.to(groupId).emit('user-renamed', { oldName, newName });
        }
    });

    socket.on('play-video', ({ groupId, videoId }) => {
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
        const group = groups.get(groupId);
        if (group) {
            socket.join(groupId);
            group.members.set(socket.id, { userId, name: userId });
            socket.emit('old-messages', group.messages);
            socket.emit('rejoin-success');
            const isAdmin = group.adminId === socket.id;
            socket.emit('admin-status', isAdmin);
            const onlineList = Array.from(group.members.values()).map(m => ({ userId: m.userId, name: m.name }));
            io.to(groupId).emit('online-users', onlineList);
        }
    });

    socket.on('disconnect', () => {
        for (let [groupId, group] of groups.entries()) {
            if (group.members.has(socket.id)) {
                group.members.delete(socket.id);
                const onlineList = Array.from(group.members.values()).map(m => ({ userId: m.userId, name: m.name }));
                io.to(groupId).emit('online-users', onlineList);
                socket.to(groupId).emit('user-left', { user: 'someone' });
                break;
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
