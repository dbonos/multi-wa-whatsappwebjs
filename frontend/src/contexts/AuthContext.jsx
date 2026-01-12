import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        try {
          const response = await authAPI.getMe();
          setUser(response.data.user);
        } catch (error) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (loginData) => {
    try {
      // Support both old format (username, password) and new format (object)
      let loginPayload;
      if (typeof loginData === 'string') {
        // Legacy format: username, password
        const [username, password] = arguments;
        loginPayload = { username, password };
      } else {
        // New format: { username?, sessionName?, password?, otp?, loginMethod? }
        loginPayload = loginData;
      }

      console.log('📤 [AUTH] Sending login request:', {
        hasUsername: !!loginPayload.username,
        hasSessionName: !!loginPayload.sessionName,
        hasPassword: !!loginPayload.password,
        hasOtp: !!loginPayload.otp,
        loginMethod: loginPayload.loginMethod
      });

      const response = await authAPI.login(loginPayload);
      const { token: newToken, user: userData } = response.data;
      
      console.log('✅ [AUTH] Token received:', {
        tokenLength: newToken?.length || 0,
        tokenPreview: newToken ? `${newToken.substring(0, 30)}...` : 'NO TOKEN',
        userId: userData?.id,
        username: userData?.username,
        role: userData?.role
      });
      
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setToken(newToken);
      setUser(userData);
      
      console.log('💾 [AUTH] Token saved to localStorage');
      
      return { success: true };
    } catch (error) {
      console.error('❌ [AUTH] Login error:', {
        status: error.response?.status,
        error: error.response?.data?.error || error.message
      });
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed',
      };
    }
  };

  const requestOTP = async (sessionName) => {
    try {
      const response = await authAPI.requestOTP(sessionName);
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to request OTP',
      };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to change password',
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    requestOTP,
    changePassword,
    isAuthenticated: !!token,
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

