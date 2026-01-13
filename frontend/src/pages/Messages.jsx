import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { messagesAPI, sessionsAPI } from '../services/api';
import socketService from '../services/socket';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import MessageDetailModal from '../components/MessageDetailModal';
import {
  Send,
  Paperclip,
  Loader2,
  CheckCircle2,
  Clock,
  Eye,
  Play,
  XCircle,
  Filter,
  Heart,
  Reply,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  Info,
} from 'lucide-react';

const statusIcons = {
  sent: { icon: CheckCircle2, color: 'text-blue-500' },
  delivered: { icon: CheckCircle2, color: 'text-green-500' },
  read: { icon: Eye, color: 'text-green-600' },
  played: { icon: Play, color: 'text-purple-500' },
  pending: { icon: Clock, color: 'text-gray-400' },
  failed: { icon: XCircle, color: 'text-red-500' },
};

export default function Messages() {
  const { isAuthenticated, token } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedMessages, setDeletedMessages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMessages, setTotalMessages] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 20;

  useEffect(() => {
    // Check authentication before loading
    if (!isAuthenticated || !token) {
      console.error('❌ [MESSAGES] Not authenticated or no token!');
      toast.error('Please login first');
      return;
    }
    
    console.log('✅ [MESSAGES] Authenticated, token:', token ? `${token.substring(0, 20)}...` : 'MISSING');
    loadSessions();
    socketService.connect();

    // Listen for message status updates
    const handleStatus = (data) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.message_id === data.messageId
            ? { ...m, status: data.status }
            : m
        )
      );
    };

    // Listen for reactions
    const handleReaction = (data) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.message_id === data.messageId) {
            const reactions = m.reactions || [];
            const existingIndex = reactions.findIndex(
              (r) => r.from_number === data.from && r.reaction_emoji === data.reaction.emoji
            );
            if (existingIndex >= 0) {
              reactions[existingIndex] = {
                ...reactions[existingIndex],
                ...data.reaction,
              };
            } else {
              reactions.push({
                reaction_emoji: data.reaction.emoji,
                reaction_text: data.reaction.text,
                from_number: data.from,
                timestamp: Date.now() / 1000,
              });
            }
            return { ...m, reactions };
          }
          return m;
        })
      );
    };

    // Listen for revoked messages
    const handleRevoked = (data) => {
      if (data.type === 'retracted' || data.type === 'deleted') {
        setMessages((prev) =>
          prev.map((m) =>
            m.message_id === data.messageId
              ? {
                  ...m,
                  is_retracted: data.type === 'retracted',
                  is_deleted: data.type === 'deleted',
                }
              : m
          )
        );
        loadDeletedMessages();
      }
    };

    socketService.on('message_status', handleStatus);
    socketService.on('message_reaction', handleReaction);
    socketService.on('message_revoked', handleRevoked);

    return () => {
      socketService.off('message_status', handleStatus);
      socketService.off('message_reaction', handleReaction);
      socketService.off('message_revoked', handleRevoked);
    };
  }, []);

  useEffect(() => {
    if (selectedSession) {
      setCurrentPage(1);
      loadMessages(1);
    }
  }, [selectedSession, filterStatus, showDeleted]);

  useEffect(() => {
    if (selectedSession && currentPage > 1) {
      loadMessages(currentPage);
    }
  }, [currentPage]);

  const loadSessions = async () => {
    try {
      const response = await sessionsAPI.list();
      const sessionsList = response.data?.sessions || response.data || [];
      const readySessions = sessionsList.filter(
        (s) => s.realtime_status === 'ready' || s.status === 'ready'
      );
      setSessions(readySessions);
      
      // Auto-select first ready session if none selected
      if (readySessions.length > 0 && !selectedSession) {
        const firstSessionId = readySessions[0].session_id;
        console.log('✅ [FRONTEND] Auto-selecting session:', firstSessionId);
        setSelectedSession(firstSessionId);
      } else if (readySessions.length === 0) {
        console.warn('⚠️ [FRONTEND] No ready sessions available');
        setSelectedSession('');
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('Failed to load sessions: ' + (error.response?.data?.error || error.message));
    }
  };

  const loadMessages = async (page = 1) => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      const params = { 
        sessionId: selectedSession, 
        limit: pageSize, 
        offset,
        includeDeleted: showDeleted 
      };
      const response = await messagesAPI.list(params);
      let msgs = response.data.messages || [];

      if (filterStatus !== 'all') {
        msgs = msgs.filter((m) => m.status === filterStatus);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        msgs = msgs.filter((m) => 
          (m.to_number && m.to_number.toLowerCase().includes(query)) ||
          (m.body && m.body.toLowerCase().includes(query)) ||
          (m.caption && m.caption.toLowerCase().includes(query))
        );
      }

      setMessages(msgs);
      
      // Calculate pagination (estimate total from current data)
      if (msgs.length === pageSize) {
        setTotalPages(page + 1); // Assume there's more
      } else {
        setTotalPages(page);
      }
      setTotalMessages((page - 1) * pageSize + msgs.length);
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast.error('Failed to load messages: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const loadDeletedMessages = async () => {
    try {
      const params = { sessionId: selectedSession, limit: 50 };
      const response = await messagesAPI.getDeleted(params);
      setDeletedMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to load deleted messages:', error);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    
    // Force console log - make sure it appears
    console.log('%c🚀 [SEND MESSAGE] ==========================================', 'color: blue; font-size: 14px; font-weight: bold');
    console.log('🚀 [SEND MESSAGE] Starting send message process...');
    console.log('🚀 [SEND MESSAGE] Form submitted at:', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
    
    // Check authentication first
    const tokenFromStorage = localStorage.getItem('token');
    console.log('🔐 [SEND MESSAGE] Token check:', {
      isAuthenticated,
      hasToken: !!token,
      hasTokenFromStorage: !!tokenFromStorage,
      tokenPreview: token ? `${token.substring(0, 30)}...` : 'MISSING',
      tokenFromStoragePreview: tokenFromStorage ? `${tokenFromStorage.substring(0, 30)}...` : 'MISSING'
    });
    
    if (!isAuthenticated || !token) {
      toast.error('Please login first');
      console.error('❌ [SEND MESSAGE] Cannot send: not authenticated');
      console.error('❌ [SEND MESSAGE] isAuthenticated:', isAuthenticated);
      console.error('❌ [SEND MESSAGE] token:', token ? 'EXISTS' : 'MISSING');
      console.error('❌ [SEND MESSAGE] tokenFromStorage:', tokenFromStorage ? 'EXISTS' : 'MISSING');
      return;
    }
    
    console.log('✅ [SEND MESSAGE] Authentication check passed');
    console.log('✅ [SEND MESSAGE] Token:', token ? `${token.substring(0, 30)}...` : 'MISSING');
    
    // Validate phone number
    console.log('📱 [SEND MESSAGE] Phone validation:', { phone, trimmed: phone.trim(), isEmpty: !phone.trim() });
    if (!phone.trim()) {
      toast.error('Phone number is required');
      console.error('❌ [SEND MESSAGE] Phone number is empty');
      return;
    }
    
    // Validate message or attachment
    console.log('💬 [SEND MESSAGE] Message validation:', {
      messageLength: message.trim().length,
      hasAttachment: !!attachment,
      attachmentName: attachment?.name
    });
    if (!message.trim() && !attachment) {
      toast.error('Message or attachment is required');
      console.error('❌ [SEND MESSAGE] Both message and attachment are empty');
      return;
    }
    
    // Validate session is selected
    console.log('📋 [SEND MESSAGE] Session validation:', {
      selectedSession,
      trimmed: selectedSession?.trim(),
      isEmpty: !selectedSession || !selectedSession.trim()
    });
    if (!selectedSession || !selectedSession.trim()) {
      toast.error('Please select a session first');
      console.error('❌ [SEND MESSAGE] Session not selected');
      return;
    }

    setSending(true);
    try {
      // If no attachment, send as JSON (simpler and more reliable)
      // If attachment exists, use FormData
      const sessionIdToSend = selectedSession.trim();
      const phoneToSend = phone.trim();
      const messageToSend = message.trim();
      
      console.log('%c📋 [SEND MESSAGE] Message details:', 'color: green; font-weight: bold', {
        sessionId: sessionIdToSend,
        phone: phoneToSend,
        messageLength: messageToSend.length,
        messagePreview: messageToSend.substring(0, 50),
        hasAttachment: !!attachment,
        attachmentType: attachment?.type,
        attachmentName: attachment?.name
      });
      
      // Explicitly check if attachment exists and is a valid File object
      const hasAttachment = attachment && attachment instanceof File;
      
      if (hasAttachment) {
        console.log('📎 [SEND MESSAGE] Using FormData (has attachment)');
        const formData = new FormData();
        formData.append('sessionId', sessionIdToSend);
        formData.append('phone', phoneToSend);
        // If there's text with attachment, send it as both message and caption
        // Backend will use it as caption for the media
        if (messageToSend) {
          formData.append('message', messageToSend);
          formData.append('caption', messageToSend); // Also send as caption for clarity
        }
        formData.append('attachment', attachment);
        
        // Debug: verify FormData contents
        console.log('%c📤 [SEND MESSAGE] FormData contents:', 'color: orange; font-weight: bold', {
          hasSessionId: formData.has('sessionId'),
          hasPhone: formData.has('phone'),
          hasMessage: formData.has('message'),
          hasAttachment: formData.has('attachment'),
          sessionIdValue: sessionIdToSend,
          phoneValue: phoneToSend
        });
        
        console.log('📤 [SEND MESSAGE] Calling messagesAPI.send() with FormData...');
        const response = await messagesAPI.send(formData);
        console.log('✅ [SEND MESSAGE] API response received:', response);
      } else {
        console.log('📝 [SEND MESSAGE] Using JSON (no attachment)');
        const jsonData = {
          sessionId: sessionIdToSend,
          phone: phoneToSend,
          message: messageToSend
        };
        console.log('%c📤 [SEND MESSAGE] Sending JSON data:', 'color: orange; font-weight: bold', jsonData);
        console.log('📤 [SEND MESSAGE] Calling messagesAPI.send() with JSON...');
        const response = await messagesAPI.send(jsonData);
        console.log('✅ [SEND MESSAGE] API response received:', response);
      }
      
      console.log('✅ [SEND MESSAGE] Message sent successfully!');
      setPhone('');
      setMessage('');
      setAttachment(null);
      toast.success('Message sent successfully!');
      await loadMessages(1); // Reload first page
      setCurrentPage(1);
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      const errorDetails = error.response?.data?.received || error.response?.data;
      
      console.error('%c❌ [SEND MESSAGE] Send message error:', 'color: red; font-weight: bold', error);
      console.error('❌ [SEND MESSAGE] Error status:', error.response?.status);
      console.error('❌ [SEND MESSAGE] Error response:', error.response?.data);
      console.error('❌ [SEND MESSAGE] Error details:', errorDetails);
      
      // Show detailed error message
      let errorMessage = 'Failed to send message: ' + errorMsg;
      if (errorDetails && typeof errorDetails === 'object') {
        const missingFields = [];
        if (!errorDetails.sessionId) missingFields.push('sessionId');
        if (!errorDetails.phone) missingFields.push('phone');
        if (missingFields.length > 0) {
          errorMessage += `\nMissing: ${missingFields.join(', ')}`;
        }
      }
      
      toast.error(errorMessage, { duration: 5000 });
      alert(`Error: ${errorMessage}\n\nCheck console for details.`);
    } finally {
      setSending(false);
      console.log('🏁 [SEND MESSAGE] Process completed');
      console.log('🚀 [SEND MESSAGE] ==========================================');
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

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

  const messageVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.3,
      },
    },
    exit: {
      opacity: 0,
      x: 20,
      transition: {
        duration: 0.2,
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
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-600 mt-1">Send and manage WhatsApp messages</p>
      </motion.div>

      {/* Session Selector */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="card"
      >
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Session
        </label>
        <select
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
          className="input"
          disabled={sessions.length === 0}
        >
          {sessions.length === 0 ? (
            <option>No active sessions available</option>
          ) : (
            <>
              <option value="">Select a session</option>
              {sessions.map((s) => (
                <option key={s.session_id} value={s.session_id}>
                  {s.session_id} {s.phone_number && `(${s.phone_number})`}
                </option>
              ))}
            </>
          )}
        </select>
      </motion.div>

      {/* Send Message Form */}
      <AnimatePresence>
        {selectedSession && (
          <motion.div
            key="send-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="card bg-gradient-to-r from-whatsapp to-whatsapp-dark text-white"
          >
          <h2 className="text-xl font-semibold mb-4">Send Message</h2>
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="6281234567890"
                className="w-full px-4 py-2 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
                required
                disabled={sending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={4}
                className="w-full px-4 py-2 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 resize-none"
                disabled={sending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Attachment (Optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1 px-4 py-2 rounded-lg bg-white/20 backdrop-blur-sm border border-white/30 cursor-pointer hover:bg-white/30 transition-colors flex items-center justify-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  {attachment ? attachment.name : 'Choose File'}
                  <input
                    type="file"
                    onChange={(e) => setAttachment(e.target.files[0])}
                    className="hidden"
                    disabled={sending}
                  />
                </label>
                {attachment && (
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={sending || !phone.trim() || (!message.trim() && !attachment)}
              className="btn bg-white text-whatsapp hover:bg-gray-100 w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Message
                </>
              )}
            </button>
          </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages List */}
      {selectedSession && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>Sent Messages</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant={showDeleted ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setShowDeleted(!showDeleted);
                    loadDeletedMessages();
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  {showDeleted ? 'Hide' : 'Show'} Deleted
                </Button>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="input py-1 text-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="read">Read</option>
                    <option value="played">Played</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by phone number or message content..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-whatsapp"
              />
            </div>
          </CardHeader>
          <CardContent>

          {loading && currentPage === 1 ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 text-gray-500"
            >
              No messages found
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              <AnimatePresence>
                {messages.map((msg, index) => {
                const StatusIcon = statusIcons[msg.status]?.icon || Clock;
                const statusColor = statusIcons[msg.status]?.color || 'text-gray-400';
                const isDeleted = msg.is_deleted || msg.is_retracted;

                return (
                  <motion.div
                    key={msg.message_id}
                    variants={messageVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                  >
                    <Card
                      className={`${isDeleted ? 'opacity-60 bg-gray-100 dark:bg-gray-800' : ''} transition-all cursor-pointer hover:shadow-md`}
                      onClick={() => setSelectedMessageId(msg.message_id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                To: {msg.to_number || 'Unknown'}
                              </span>
                            <StatusIcon className={`w-4 h-4 ${statusColor}`} />
                            <Badge variant={msg.status === 'read' ? 'success' : msg.status === 'failed' ? 'destructive' : 'info'}>
                              {msg.status}
                            </Badge>
                            {isDeleted && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <Trash2 className="w-3 h-3" />
                                {msg.is_retracted ? 'Retracted' : 'Deleted'}
                              </Badge>
                            )}
                          </div>

                          {/* Reply indicator */}
                          {msg.replyToMessage && (
                            <div className="mb-2 p-2 bg-gray-100 rounded border-l-4 border-whatsapp">
                              <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                                <Reply className="w-3 h-3" />
                                Replying to:
                              </div>
                              <p className="text-sm text-gray-700 truncate">
                                {msg.replyToMessage.body || msg.replyToMessage.caption || '(Media)'}
                              </p>
                            </div>
                          )}

                          <p className={`text-gray-700 ${isDeleted ? 'line-through' : ''}`}>
                            {msg.body || msg.caption || '(No text)'}
                          </p>
                          {msg.file_name && (
                            <p className="text-sm text-gray-500 mt-1">
                              📎 {msg.file_name} ({msg.file_type})
                            </p>
                          )}

                          {/* Reactions */}
                          {msg.reactions && msg.reactions.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              {msg.reactions.map((reaction, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="flex items-center gap-1"
                                >
                                  <span>{reaction.reaction_emoji}</span>
                                  <span className="text-xs">
                                    {reaction.from_number?.slice(-4) || '?'}
                                  </span>
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          {/* Click to view details */}
                          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Info className="w-3 h-3" />
                            <span>Click to view details</span>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                          {formatDate(msg.timestamp)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Pagination */}
          {!loading && messages.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-gray-600">
                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalMessages)} of {totalMessages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-10"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          </CardContent>
        </Card>
      )}

      {/* Message Detail Modal */}
      {selectedMessageId && (
        <MessageDetailModal
          messageId={selectedMessageId}
          sessionId={selectedSession}
          onClose={() => setSelectedMessageId(null)}
        />
      )}
    </motion.div>
  );
}

