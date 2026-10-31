// Connection settings. Defaults use PeerJS's free public broker and public STUN servers.
// Optional build-time overrides (e.g. in a .env file or GitHub Actions secrets):
//   VITE_TURN_URL, VITE_TURN_USER, VITE_TURN_PASS   – a TURN relay for players on strict networks
//   VITE_PEER_HOST, VITE_PEER_PORT, VITE_PEER_PATH   – a self-hosted PeerJS broker
const env = import.meta.env || {};

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];
if (env.VITE_TURN_URL) {
  iceServers.push({ urls: env.VITE_TURN_URL.split(','), username: env.VITE_TURN_USER, credential: env.VITE_TURN_PASS });
}

export const PEER_OPTIONS = {
  debug: 1,
  config: { iceServers },
  ...(env.VITE_PEER_HOST ? {
    host: env.VITE_PEER_HOST,
    port: +(env.VITE_PEER_PORT || 443),
    path: env.VITE_PEER_PATH || '/',
    secure: (env.VITE_PEER_PORT || '443') === '443'
  } : {})
};

export const PEER_PREFIX = 'boomwies-v1-';
export const RECONNECT_GRACE_MS = 30000;
