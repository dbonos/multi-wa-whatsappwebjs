import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sessionsAPI } from '../services/api';
import socketService from '../services/socket';
import SessionCard from '../components/SessionCard';
import WebhookSettings from '../components/WebhookSettings';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Loader2, RefreshCw, Search, Link as LinkIcon, X } from 'lucide-react';
import { toast } from 'sonner';

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSessionId, setNewSessionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionForWebhook, setSelectedSessionForWebhook] = useState(null);

  useEffect(() => {
    socketService.connect();
    loadSessions();

    // Listen for session status updates
    const handleStatus = (data) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.session_id === data.sessionId
            ? { ...s, realtime_status: data.status }
            : s
        )
      );
    };

    socketService.on('session_status', handleStatus);

    return () => {
      socketService.off('session_status', handleStatus);
    };
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const response = await sessionsAPI.list();
      setSessions(response.data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    if (!newSessionId.trim()) return;

    setCreating(true);
    try {
      await sessionsAPI.create(newSessionId.trim());
      setNewSessionId('');
      await loadSessions();
    } catch (error) {
      toast.error('Failed to create session: ' + (error.response?.data?.error || error.message));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (sessionId) => {
    setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
  };

  const filteredSessions = sessions.filter((session) =>
    session.session_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (session.phone_number && session.phone_number.includes(searchQuery))
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
      },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Manage your WhatsApp sessions and connections
          </p>
        </div>
        <button
          onClick={loadSessions}
          className="btn btn-secondary flex items-center gap-2 w-full md:w-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </motion.div>

      {/* Create New Session - Admin Only */}
      {isAdmin && (
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="visible"
          className="card bg-gradient-to-r from-whatsapp to-whatsapp-dark text-white"
        >
          <h2 className="text-xl font-semibold mb-4">Add New WhatsApp Session</h2>
          <form onSubmit={handleCreateSession} className="flex gap-2">
            <input
              type="text"
              value={newSessionId}
              onChange={(e) => setNewSessionId(e.target.value)}
              placeholder="Enter session name (e.g., my_whatsapp_1)"
              className="flex-1 px-4 py-2 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
              required
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating || !newSessionId.trim()}
              className="btn bg-white text-whatsapp hover:bg-gray-100 flex items-center gap-2 px-6 disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Create
                </>
              )}
            </button>
          </form>
        </motion.div>
      )}

      {/* Search */}
      <AnimatePresence>
        {sessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="relative"
          >
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="input pl-10"
          />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions Grid */}
      {loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-12"
        >
          <Loader2 className="w-8 h-8 animate-spin text-whatsapp" />
        </motion.div>
      ) : filteredSessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card text-center py-12"
        >
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No sessions found
          </h3>
          <p className="text-gray-600">
            {searchQuery
              ? 'Try a different search term'
              : 'Create your first WhatsApp session to get started'}
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence>
            {filteredSessions.map((session) => (
              <motion.div
                key={session.session_id}
                variants={itemVariants}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <SessionCard
                  session={session}
                  onDelete={handleDelete}
                  onRefresh={loadSessions}
                />
                {isAdmin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="card"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => setSelectedSessionForWebhook(
                          selectedSessionForWebhook === session.session_id ? null : session.session_id
                        )}
                        className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-whatsapp transition-colors"
                      >
                        <LinkIcon className="w-4 h-4" />
                        Webhook Settings
                      </button>
                    </div>
                    {selectedSessionForWebhook === session.session_id && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <WebhookSettings
                          sessionId={session.session_id}
                          onClose={() => setSelectedSessionForWebhook(null)}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Stats */}
      <AnimatePresence>
        {sessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            {[
              { label: 'Total Sessions', value: sessions.length, color: 'text-gray-900' },
              { label: 'Active', value: sessions.filter((s) => s.realtime_status === 'ready').length, color: 'text-green-600' },
              { label: 'Total Messages', value: sessions.reduce((sum, s) => sum + (s.message_count || 0), 0), color: 'text-gray-900' },
              { label: 'Total Contacts', value: sessions.reduce((sum, s) => sum + (s.contact_count || 0), 0), color: 'text-gray-900' },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="card"
              >
                <p className="text-sm text-gray-600">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

