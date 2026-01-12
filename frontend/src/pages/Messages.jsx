import { useState, useEffect } from 'react';
import { messagesAPI, sessionsAPI } from '../services/api';
import socketService from '../services/socket';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
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

  useEffect(() => {
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
      loadMessages();
    }
  }, [selectedSession, filterStatus]);

  const loadSessions = async () => {
    try {
      const response = await sessionsAPI.list();
      const readySessions = response.data.sessions.filter(
        (s) => s.realtime_status === 'ready'
      );
      setSessions(readySessions);
      if (readySessions.length > 0 && !selectedSession) {
        setSelectedSession(readySessions[0].session_id);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const params = { sessionId: selectedSession, limit: 50, includeDeleted: showDeleted };
      const response = await messagesAPI.list(params);
      let msgs = response.data.messages || [];

      if (filterStatus !== 'all') {
        msgs = msgs.filter((m) => m.status === filterStatus);
      }

      setMessages(msgs);
    } catch (error) {
      console.error('Failed to load messages:', error);
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
    if (!phone.trim() || (!message.trim() && !attachment)) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('sessionId', selectedSession);
      formData.append('phone', phone);
      if (message.trim()) formData.append('message', message);
      if (attachment) formData.append('attachment', attachment);

      await messagesAPI.send(formData);
      setPhone('');
      setMessage('');
      setAttachment(null);
      await loadMessages();
    } catch (error) {
      alert('Failed to send message: ' + (error.response?.data?.error || error.message));
    } finally {
      setSending(false);
    }
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-600 mt-1">Send and manage WhatsApp messages</p>
      </div>

      {/* Session Selector */}
      <div className="card">
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
      </div>

      {/* Send Message Form */}
      {selectedSession && (
        <div className="card bg-gradient-to-r from-whatsapp to-whatsapp-dark text-white">
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
        </div>
      )}

      {/* Messages List */}
      {selectedSession && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
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
          </CardHeader>
          <CardContent>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-whatsapp" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No messages found
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const StatusIcon = statusIcons[msg.status]?.icon || Clock;
                const statusColor = statusIcons[msg.status]?.color || 'text-gray-400';
                const isDeleted = msg.is_deleted || msg.is_retracted;

                return (
                  <Card
                    key={msg.id}
                    className={`${isDeleted ? 'opacity-60 bg-gray-100' : ''} transition-all`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-gray-900">
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
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                          {formatDate(msg.timestamp)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

