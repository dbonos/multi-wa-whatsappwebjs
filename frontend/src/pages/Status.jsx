import { useState, useEffect } from 'react';
import { statusAPI, sessionsAPI } from '../services/api';
import {
  Image,
  Send,
  Loader2,
  Paperclip,
  Video,
  FileText,
  CheckCircle2,
} from 'lucide-react';

export default function Status() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('status'); // 'status' or 'story'

  useEffect(() => {
    loadSessions();
  }, []);

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

  const handleSetStatus = async (e) => {
    e.preventDefault();
    if (!message.trim() && !attachment) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('sessionId', selectedSession);
      if (message.trim()) formData.append('message', message);
      if (attachment) formData.append('attachment', attachment);

      await statusAPI.setStatus(formData);
      alert('Status updated successfully!');
      setMessage('');
      setAttachment(null);
    } catch (error) {
      alert('Failed to set status: ' + (error.response?.data?.error || error.message));
    } finally {
      setSending(false);
    }
  };

  const handleSetStory = async (e) => {
    e.preventDefault();
    if (!message.trim() && !attachment) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('sessionId', selectedSession);
      if (message.trim()) formData.append('message', message);
      if (attachment) formData.append('attachment', attachment);

      await statusAPI.setStory(formData);
      alert('Story posted successfully!');
      setMessage('');
      setAttachment(null);
    } catch (error) {
      alert('Failed to post story: ' + (error.response?.data?.error || error.message));
    } finally {
      setSending(false);
    }
  };

  const getFileType = (file) => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'other';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Status & Stories</h1>
        <p className="text-gray-600 mt-1">Update your WhatsApp status and post stories</p>
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

      {/* Tabs */}
      {selectedSession && (
        <div className="card">
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => {
                setActiveTab('status');
                setMessage('');
                setAttachment(null);
              }}
              className={`flex-1 px-4 py-3 font-medium transition-colors ${
                activeTab === 'status'
                  ? 'border-b-2 border-whatsapp text-whatsapp'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-5 h-5 inline mr-2" />
              Status
            </button>
            <button
              onClick={() => {
                setActiveTab('story');
                setMessage('');
                setAttachment(null);
              }}
              className={`flex-1 px-4 py-3 font-medium transition-colors ${
                activeTab === 'story'
                  ? 'border-b-2 border-whatsapp text-whatsapp'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Image className="w-5 h-5 inline mr-2" />
              Story
            </button>
          </div>

          <form
            onSubmit={activeTab === 'status' ? handleSetStatus : handleSetStory}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {activeTab === 'status' ? 'Status Message' : 'Story Caption'} (Optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  activeTab === 'status'
                    ? 'What\'s on your mind?'
                    : 'Add a caption to your story...'
                }
                rows={4}
                className="input resize-none"
                disabled={sending}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {activeTab === 'status' ? 'Media' : 'Story Media'} (Optional)
              </label>
              <div className="space-y-3">
                <label className="flex items-center justify-center gap-2 px-6 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-whatsapp hover:bg-whatsapp/5 transition-colors">
                  {attachment ? (
                    <>
                      {getFileType(attachment) === 'image' ? (
                        <Image className="w-6 h-6 text-whatsapp" />
                      ) : getFileType(attachment) === 'video' ? (
                        <Video className="w-6 h-6 text-whatsapp" />
                      ) : (
                        <Paperclip className="w-6 h-6 text-whatsapp" />
                      )}
                      <span className="text-whatsapp font-medium">{attachment.name}</span>
                    </>
                  ) : (
                    <>
                      <Paperclip className="w-6 h-6 text-gray-400" />
                      <span className="text-gray-600">
                        Click to upload {activeTab === 'story' ? 'image or video' : 'media'}
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept={activeTab === 'story' ? 'image/*,video/*' : '*'}
                    onChange={(e) => setAttachment(e.target.files[0])}
                    className="hidden"
                    disabled={sending}
                  />
                </label>
                {attachment && (
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="btn btn-danger w-full"
                  >
                    Remove Attachment
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={sending || (!message.trim() && !attachment)}
              className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {activeTab === 'status' ? 'Updating Status...' : 'Posting Story...'}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {activeTab === 'status' ? 'Update Status' : 'Post Story'}
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

