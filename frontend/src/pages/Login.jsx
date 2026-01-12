import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle, Lock, User, Loader2, Smartphone, Mail, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [loginType, setLoginType] = useState('admin'); // 'admin' or 'user'
  const [username, setUsername] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginMethod, setLoginMethod] = useState('password'); // 'password' or 'otp'
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, requestOTP } = useAuth();
  const navigate = useNavigate();

  const handleRequestOTP = async () => {
    if (!sessionName) {
      toast.error('Please enter session name (phone number)');
      return;
    }

    setOtpLoading(true);
    setError('');

    const result = await requestOTP(sessionName);

    if (result.success) {
      setOtpRequested(true);
      toast.success('OTP sent successfully! Check your WhatsApp.');
    } else {
      setError(result.error || 'Failed to request OTP');
      toast.error(result.error || 'Failed to request OTP');
    }

    setOtpLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (loginType === 'admin') {
      // Admin login: username + password
      if (!username || !password) {
        setError('Username and password required');
        return;
      }

      console.log('🔐 [LOGIN] Requesting token (Admin):', { username });
      setLoading(true);
      const result = await login({ username, password });

      if (result.success) {
        console.log('✅ [LOGIN] Login successful (Admin)');
        toast.success('Login successful!');
        navigate('/dashboard');
      } else {
        console.error('❌ [LOGIN] Login failed:', result.error);
        setError(result.error || 'Login failed');
        toast.error(result.error || 'Login failed');
      }
      setLoading(false);
    } else {
      // User login: session name + password or OTP
      if (!sessionName) {
        setError('Session name (phone number) required');
        return;
      }

      if (loginMethod === 'otp') {
        if (!otp) {
          setError('OTP code required');
          return;
        }

        console.log('🔐 [LOGIN] Requesting token (User - OTP):', { sessionName, otpLength: otp.length });
        setLoading(true);
        const result = await login({ sessionName, otp, loginMethod: 'otp' });

        if (result.success) {
          console.log('✅ [LOGIN] Login successful (User - OTP)');
          toast.success('Login successful!');
          navigate('/dashboard');
        } else {
          console.error('❌ [LOGIN] Login failed:', result.error);
          setError(result.error || 'Invalid OTP');
          toast.error(result.error || 'Invalid OTP');
        }
        setLoading(false);
      } else {
        if (!password) {
          setError('Password required');
          return;
        }

        console.log('🔐 [LOGIN] Requesting token (User - Password):', { sessionName });
        setLoading(true);
        const result = await login({ sessionName, password });

        if (result.success) {
          console.log('✅ [LOGIN] Login successful (User - Password)');
          toast.success('Login successful!');
          navigate('/dashboard');
        } else {
          console.error('❌ [LOGIN] Login failed:', result.error);
          setError(result.error || 'Login failed');
          toast.error(result.error || 'Login failed');
        }
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-whatsapp via-whatsapp-dark to-green-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg mb-4"
          >
            <MessageCircle className="w-10 h-10 text-whatsapp" />
          </motion.div>
          <h1 className="text-3xl font-bold text-white mb-2">
            WhatsApp Manager
          </h1>
          <p className="text-green-100">
            Multi-Instance WhatsApp Management System
          </p>
        </motion.div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="card bg-white/95 backdrop-blur-sm shadow-2xl"
        >
          {/* Login Type Toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setLoginType('admin');
                setError('');
                setOtpRequested(false);
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                loginType === 'admin'
                  ? 'bg-white shadow-sm text-whatsapp'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Shield className="w-4 h-4" />
                <span>Admin</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginType('user');
                setError('');
                setOtpRequested(false);
              }}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                loginType === 'user'
                  ? 'bg-white shadow-sm text-whatsapp'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <User className="w-4 h-4" />
                <span>User</span>
              </div>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2"
                >
                  <Lock className="w-5 h-5" />
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {loginType === 'admin' ? (
              <>
                {/* Admin Login */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="input pl-10"
                      placeholder="Enter admin username"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input pl-10"
                      placeholder="Enter password"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* User Login */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Session Name (Phone Number)
                  </label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={sessionName}
                      onChange={(e) => {
                        setSessionName(e.target.value);
                        setOtpRequested(false);
                      }}
                      className="input pl-10"
                      placeholder="628112298898"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Login Method Toggle */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('password');
                      setOtpRequested(false);
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                      loginMethod === 'password'
                        ? 'bg-whatsapp text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('otp');
                      setOtpRequested(false);
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                      loginMethod === 'otp'
                        ? 'bg-whatsapp text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    OTP
                  </button>
                </div>

                {loginMethod === 'password' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input pl-10"
                        placeholder="Enter password"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {!otpRequested ? (
                      <div>
                        <button
                          type="button"
                          onClick={handleRequestOTP}
                          disabled={otpLoading || !sessionName}
                          className="btn btn-secondary w-full flex items-center justify-center gap-2"
                        >
                          {otpLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Requesting OTP...</span>
                            </>
                          ) : (
                            <>
                              <Mail className="w-4 h-4" />
                              <span>Request OTP</span>
                            </>
                          )}
                        </button>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          OTP will be sent to your WhatsApp
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          OTP Code
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            type="text"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="input pl-10 text-center text-2xl tracking-widest"
                            placeholder="000000"
                            maxLength={6}
                            required
                            disabled={loading}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleRequestOTP}
                          disabled={otpLoading}
                          className="text-xs text-whatsapp mt-2 hover:underline"
                        >
                          Resend OTP
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={loading || (loginType === 'user' && loginMethod === 'otp' && !otpRequested)}
              className="btn btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Login</span>
                </>
              )}
            </button>
          </form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 pt-6 border-t border-gray-200"
          >
            <p className="text-xs text-gray-500 text-center">
              {loginType === 'admin' 
                ? 'Admin login with username and password'
                : 'User login with session name and password or OTP'}
            </p>
          </motion.div>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-green-100 mt-6 text-sm">
          © 2026 WhatsApp Manager. All rights reserved.
        </p>
      </div>
    </div>
  );
}
