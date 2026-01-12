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
    
    // Debug: log token status for all requests - FORCE LOG
    console.log('%c🔐 [API] Request interceptor:', 'color: purple; font-weight: bold', {
      url: config.url,
      method: config.method,
      hasToken: !!token,
      tokenLength: token?.length || 0,
      tokenPreview: token ? `${token.substring(0, 30)}...` : 'NO TOKEN',
      timestamp: new Date().toISOString()
    });
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('✅ [API] Authorization header set:', `Bearer ${token.substring(0, 30)}...`);
    } else {
      console.warn('⚠️ [API] No token found in localStorage!');
      // Don't block the request, let backend handle auth error
    }
    
    // If data is FormData, remove Content-Type to let browser set it with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
      // Debug: log FormData contents
      console.log('📤 [API] Sending FormData:', {
        url: config.url,
        hasSessionId: config.data.has('sessionId'),
        hasPhone: config.data.has('phone'),
        hasMessage: config.data.has('message'),
        hasAttachment: config.data.has('attachment'),
        headers: {
          Authorization: config.headers.Authorization ? 'Bearer ***' : 'MISSING',
          'Content-Type': config.headers['Content-Type'] || 'will be set by browser'
        }
      });
    } else if (config.data && typeof config.data === 'object') {
      // For JSON objects, ensure Content-Type is set
      config.headers['Content-Type'] = 'application/json';
      console.log('📤 [API] Sending JSON:', {
        url: config.url,
        data: config.data,
        headers: {
          Authorization: config.headers.Authorization ? 'Bearer ***' : 'MISSING',
          'Content-Type': config.headers['Content-Type']
        }
      });
      // Validate required fields before sending
      if (config.url === '/messages/send') {
        if (!config.data.sessionId || !config.data.phone) {
          console.error('❌ [API] Missing required fields:', {
            sessionId: config.data.sessionId,
            phone: config.data.phone,
            data: config.data
          });
        } else {
          console.log('✅ [API] All required fields present');
        }
      }
    }
    
    return config;
  },
  (error) => {
    console.error('❌ [API] Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Handle auth errors
api.interceptors.response.use(
  (response) => {
    // Log successful responses for messages endpoint
    if (response.config?.url === '/messages/send') {
      console.log('✅ [API] Message sent successfully:', {
        status: response.status,
        data: response.data
      });
    }
    return response;
  },
  (error) => {
    console.error('❌ [API] Response error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      headers: error.response?.headers
    });
    
    if (error.response?.status === 401) {
      console.warn('⚠️ [API] Unauthorized (401) - redirecting to login');
      console.warn('⚠️ [API] Clearing token from localStorage');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    } else if (error.response?.status === 400) {
      console.error('❌ [API] Bad Request (400):', error.response?.data);
      if (error.config?.url === '/messages/send') {
        console.error('❌ [API] Send message failed - check required fields');
      }
    }
    
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  // Admin login: username + password
  // User login: sessionName + password or sessionName + otp
  login: (data) => {
    // Support both old format (username, password) and new format (object)
    if (typeof data === 'string') {
      // Legacy: username, password as separate params
      const [username, password] = arguments;
      return api.post('/auth/login', { username, password });
    }
    // New format: { username?, sessionName?, password?, otp?, loginMethod? }
    return api.post('/auth/login', data);
  },
  
  requestOTP: (sessionName) =>
    api.post('/auth/request-otp', { sessionName }),
  
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  
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
    // If data is already FormData, use it directly (for attachments)
    if (data instanceof FormData) {
      return api.post('/messages/send', data, {
        headers: {
          // Remove Content-Type to let browser set it automatically with boundary
        },
      });
    }
    // Otherwise, send as JSON (for text-only messages)
    return api.post('/messages/send', data, {
      headers: {
        'Content-Type': 'application/json',
      },
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

// Contacts API
export const contactsAPI = {
  list: (params = {}) => api.get('/contacts', { params }),
  
  get: (contactId, sessionId) => api.get(`/contacts/${contactId}`, { params: { sessionId } }),
};

export default api;

