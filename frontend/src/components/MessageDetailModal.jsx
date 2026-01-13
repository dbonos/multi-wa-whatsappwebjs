import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Eye, CheckCircle2, Play, XCircle, Reply, Heart, Trash2 } from 'lucide-react';
import { messagesAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';

const statusIcons = {
  sent: { icon: CheckCircle2, color: 'text-blue-500' },
  delivered: { icon: CheckCircle2, color: 'text-green-500' },
  read: { icon: Eye, color: 'text-green-600' },
  played: { icon: Play, color: 'text-purple-500' },
  pending: { icon: Clock, color: 'text-gray-400' },
  failed: { icon: XCircle, color: 'text-red-500' },
};

export default function MessageDetailModal({ messageId, sessionId, onClose }) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reactions, setReactions] = useState([]);
  const [replies, setReplies] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);

  useEffect(() => {
    if (messageId) {
      loadMessageDetails();
    }
  }, [messageId]);

  const loadMessageDetails = async () => {
    try {
      setLoading(true);
      
      // Load message status
      const statusResponse = await messagesAPI.getStatus(messageId);
      setMessage(statusResponse.data.message);
      setStatusHistory(statusResponse.data.statusHistory || []);
      setReactions(statusResponse.data.reactions || []);

      // Load replies
      try {
        const repliesResponse = await messagesAPI.getReplies(messageId);
        setReplies(repliesResponse.data.replies || []);
      } catch (err) {
        // Silently fail - replies table may not exist
        console.warn('⚠️ [MESSAGE DETAIL] Could not load replies:', err.response?.status, err.response?.data?.error || err.message);
        setReplies([]);
      }
    } catch (error) {
      console.error('Failed to load message details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000 || timestamp);
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

  if (!messageId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Message Details</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : message ? (
              <>
                {/* Message Info */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">Message Information</CardTitle>
                      <Badge variant={message.status === 'read' ? 'success' : message.status === 'failed' ? 'destructive' : 'info'}>
                        {message.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">To</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{message.to_number || 'Unknown'}</p>
                    </div>
                    {message.from_number && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">From</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{message.from_number}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Message Type</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{message.message_type || 'text'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Content</p>
                      <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                        {message.body || message.caption || '(No text content)'}
                      </p>
                    </div>
                    {message.file_name && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Attachment</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          📎 {message.file_name} ({message.file_type})
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sent At</p>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{formatDate(message.timestamp)}</p>
                    </div>
                    {(message.is_deleted || message.is_retracted) && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <Trash2 className="w-5 h-5 text-red-600" />
                        <span className="text-red-600 font-medium">
                          {message.is_retracted ? 'Message was retracted' : 'Message was deleted'}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Status History */}
                {statusHistory.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Status History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {statusHistory.map((status, index) => {
                          const StatusIcon = statusIcons[status.status]?.icon || Clock;
                          const statusColor = statusIcons[status.status]?.color || 'text-gray-400';
                          return (
                            <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <StatusIcon className={`w-5 h-5 ${statusColor}`} />
                              <div className="flex-1">
                                <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{status.status}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {new Date(status.changed_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Reactions */}
                {reactions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Heart className="w-5 h-5" />
                        Reactions ({reactions.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {reactions.map((reaction, index) => (
                          <Badge key={index} variant="secondary" className="flex items-center gap-2 px-3 py-1.5">
                            <span className="text-lg">{reaction.reaction_emoji}</span>
                            <span className="text-xs">
                              {reaction.from_number?.slice(-4) || '?'}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Replies */}
                {replies.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Reply className="w-5 h-5" />
                        Replies ({replies.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {replies.map((reply) => (
                          <div key={reply.message_id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border-l-4 border-whatsapp">
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                              From: {reply.from_number || 'Unknown'}
                            </p>
                            <p className="text-gray-900 dark:text-gray-100">
                              {reply.body || reply.caption || '(Media)'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {formatDate(reply.timestamp)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Message not found
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

