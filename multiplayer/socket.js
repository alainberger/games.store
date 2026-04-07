export const socket = io();

export function connectSocket(token) {
  socket.emit('auth', { token });
}

export function wireLobby({ onLobbies, onLobbyUpdate, onChat }) {
  socket.on('lobbies', onLobbies);
  socket.on('lobby_update', onLobbyUpdate);
  socket.on('chat', onChat);
}
