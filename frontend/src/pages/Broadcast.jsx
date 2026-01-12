import { useState, useEffect } from 'react';
import { broadcastAPI, sessionsAPI } from '../services/api';
import {
  Radio,
  Plus,
  Send,
  Loader2,
  Paperclip,
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export default function Broadcast() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [broadcastLists, setBroadcastLists] = useState([]);
  const [selectedList, setSelectedList] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListRecipients, setNewListRecipients] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      loadBroadcastLists();
    }
  }, [selectedSession]);

  const loadSessions = async () => {
    try {
      const response = await sessionsAPI.list();
      const readySessions = response.data.sessions.filter(
        (s) => s.realtime_status === 'ready'
      );
      setSessions(readySessions);
      if (readySessions.length > 0) {
        setSelectedSession(readySessions[0].session_id);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadBroadcastLists = async () => {
    try {
      setLoading(true);
      const response = await broadcastAPI.getLists(selectedSession);
      setBroadcastLists(response.data.lists || []);
    } catch (error) {
      console.error('Failed to load broadcast lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListName.trim() || !newListRecipients.trim()) return;

    const recipients = newListRecipients
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line)
      .map((line) => {
        const parts = line.split(',');
        return {
          phone: parts[0].trim(),
          name: parts[1]?.trim() || null,
        };
      });

    try {
      await broadcastAPI.createList({
        sessionId: selectedSession,
        listName: newListName,
        recipients,
      });
      setNewListName('');
      setNewListRecipients('');
      setShowCreateList(false);
      await loadBroadcastLists();
    } catch (error) {
      alert('Failed to create list: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedList || (!message.trim() && !attachment)) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('sessionId', selectedSession);
      formData.append('broadcastListId', selectedList);
      if (message.trim()) formData.append('message', message);
      if (attachment) formData.append('attachment', attachment);

      const response = await broadcastAPI.send(formData);
      alert(
        `Broadcast sent!\nSent: ${response.data.sentCount}\nFailed: ${response.data.failedCount}`
      );
      setMessage('');
      setAttachment(null);
    } catch (error) {
      alert('Failed to send broadcast: ' + (error.response?.data?.error || error.message));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Broadcast Messages</h1>
        <p className="text-gray-600 mt-1">Send messages to multiple recipients</p>
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

      {/* Broadcast Lists */}
      {selectedSession && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Broadcast Lists</h2>
            <button
              onClick={() => setShowCreateList(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create List
            </button>
          </div>

          {showCreateList ? (
            <form onSubmit={handleCreateList} className="space-y-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  List Name
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="input"
                  placeholder="e.g., Customer List"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipients (one per line: phone,name)
                </label>
                <textarea
                  value={newListRecipients}
                  onChange={(e) => setNewListRecipients(e.target.value)}
                  className="input"
                  rows={6}
                  placeholder="6281234567890,John Doe&#10;6289876543210,Jane Smith"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateList(false);
                    setNewListName('');
                    setNewListRecipients('');
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-whatsapp" />
            </div>
          ) : broadcastLists.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No broadcast lists. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {broadcastLists.map((list) => (
                <div
                  key={list.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedList == list.id
                      ? 'border-whatsapp bg-whatsapp/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedList(list.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Radio className="w-5 h-5 text-whatsapp" />
                      <div>
                        <h3 className="font-semibold text-gray-900">{list.list_name}</h3>
                        <p className="text-sm text-gray-500">
                          {list.recipient_count} recipients
                        </p>
                      </div>
                    </div>
                    {selectedList == list.id && (
                      <CheckCircle2 className="w-5 h-5 text-whatsapp" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Send Broadcast */}
      {selectedList && (
        <div className="card bg-gradient-to-r from-whatsapp to-whatsapp-dark text-white">
          <h2 className="text-xl font-semibold mb-4">Send Broadcast</h2>
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your broadcast message here..."
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
              disabled={sending || (!message.trim() && !attachment)}
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
                  Send Broadcast
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

