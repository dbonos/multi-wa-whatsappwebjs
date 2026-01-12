import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://108.137.37.171:3000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),
  
  getMe: () => api.get('/auth/me'),
};

// Sessions API
export const sessionsAPI = {
  list: () => api.get('/sessions'),
  
  create: (sessionId) => api.post('/sessions', { sessionId }),
  
  get: (sessionId) => api.get(`/sessions/${sessionId}`),
  
  getQR: (sessionId) => api.get(`/sessions/${sessionId}/qr`),
  
  getStatus: (sessionId) => api.get(`/sessions/${sessionId}/status`),
  
  delete: (sessionId) => api.delete(`/sessions/${sessionId}`),
};

// Messages API
export const messagesAPI = {
  send: (data) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key]);
      }
    });
    return api.post('/messages/send', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  list: (params = {}) => api.get('/messages', { params }),
  
  getStatus: (messageId) => api.get(`/messages/${messageId}/status`),
  
  sendTyping: (sessionId, phone) =>
    api.post('/messages/typing', { sessionId, phone }),
  
  getReactions: (messageId) => api.get(`/messages/${messageId}/reactions`),
  
  getReplies: (messageId) => api.get(`/messages/${messageId}/replies`),
  
  getDeleted: (params = {}) => api.get('/messages/deleted', { params }),
};

// Status & Stories API
export const statusAPI = {
  setStatus: (data) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key]);
      }
    });
    return api.post('/status/set', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  setStory: (data) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key]);
      }
    });
    return api.post('/stories/set', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Broadcast API
export const broadcastAPI = {
  getLists: (sessionId) => api.get('/broadcast/lists', { params: { sessionId } }),
  
  createList: (data) => api.post('/broadcast/lists', data),
  
  send: (data) => {
    const formData = new FormData();
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) {
        formData.append(key, data[key]);
      }
    });
    return api.post('/broadcast/send', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  getStatus: (broadcastMessageId) =>
    api.get(`/broadcast/${broadcastMessageId}/status`),
};

// Webhooks API
export const webhooksAPI = {
  list: (sessionId) => api.get('/webhooks', { params: { sessionId } }),
  
  create: (data) => api.post('/webhooks', data),
  
  update: (id, data) => api.put(`/webhooks/${id}`, data),
  
  delete: (id) => api.delete(`/webhooks/${id}`),
};

export default api;

