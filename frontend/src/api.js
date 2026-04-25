import axios from 'axios';

function authHeader() {
  const token = localStorage.getItem('cp_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const submitCheckin = async (data) => {
  const response = await axios.post('/api/checkin', data, { headers: authHeader() });
  return response.data;
};

export const getCommunityRisk = async () => {
  const response = await axios.get('/api/community-risk');
  return response.data;
};

// Auth
export const register = async (username, email, password) => {
  const r = await axios.post('/api/auth/register', { username, email, password });
  return r.data;
};

export const login = async (email, password) => {
  const r = await axios.post('/api/auth/login', { email, password });
  return r.data;
};

export const getMe = async () => {
  const r = await axios.get('/api/auth/me', { headers: authHeader() });
  return r.data;
};

export const getProfile = async () => {
  const r = await axios.get('/api/profile', { headers: authHeader() });
  return r.data;
};

// Friends
export const getFriends = async () => {
  const r = await axios.get('/api/friends', { headers: authHeader() });
  return r.data;
};

export const addFriend = async (username) => {
  const r = await axios.post('/api/friends/add', { username }, { headers: authHeader() });
  return r.data;
};

export const removeFriend = async (username) => {
  const r = await axios.post('/api/friends/remove', { username }, { headers: authHeader() });
  return r.data;
};

export const getLeaderboard = async () => {
  const r = await axios.get('/api/leaderboard', { headers: authHeader() });
  return r.data;
};

export const getUSMap = async () => {
  const r = await axios.get('/api/us-map');
  return r.data;
};
