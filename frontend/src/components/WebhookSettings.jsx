import { useState, useEffect } from 'react';
import { webhooksAPI, sessionsAPI } from '../services/api';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Save, X, Link as LinkIcon, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function WebhookSettings({ sessionId, onClose }) {
  const { isAdmin } = useAuth();
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    sessionId: sessionId || '',
    webhookUrl: '',
    events: ['message'],
    directionFilter: 'both', // incoming, outgoing, or both
    isActive: true
  });

  useEffect(() => {
    loadWebhooks();
    if (isAdmin) {
      loadSessions();
    }
  }, [sessionId, isAdmin]);

  const loadSessions = async () => {
    try {
      const response = await sessionsAPI.list();
      setSessions(response.data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadWebhooks = async () => {
    try {
      setLoading(true);
      const response = await webhooksAPI.list(sessionId);
      setWebhooks(response.data.webhooks || []);
    } catch (error) {
      toast.error('Failed to load webhooks: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.webhookUrl.trim()) {
      toast.error('Webhook URL is required');
      return;
    }

    try {
      await webhooksAPI.create(formData);
      toast.success('Webhook created successfully');
      setShowAddForm(false);
      setFormData({
        sessionId: sessionId || '',
        webhookUrl: '',
        events: ['message'],
        directionFilter: 'both',
        isActive: true
      });
      loadWebhooks();
    } catch (error) {
      toast.error('Failed to create webhook: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUpdate = async (id, updates) => {
    try {
      await webhooksAPI.update(id, updates);
      toast.success('Webhook updated successfully');
      setEditingId(null);
      loadWebhooks();
    } catch (error) {
      toast.error('Failed to update webhook: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      await webhooksAPI.delete(id);
      toast.success('Webhook deleted successfully');
      loadWebhooks();
    } catch (error) {
      toast.error('Failed to delete webhook: ' + (error.response?.data?.error || error.message));
    }
  };

  const toggleActive = async (webhook) => {
    await handleUpdate(webhook.id, { isActive: !webhook.is_active });
  };

  const availableEvents = [
    { value: 'message', label: 'Message' },
    { value: 'message_reaction', label: 'Message Reaction' },
    { value: 'message_revoked', label: 'Message Revoked' },
    { value: 'status_update', label: 'Status Update' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-whatsapp" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <LinkIcon className="w-5 h-5" />
          Webhook Settings
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Add Webhook Form */}
      {showAddForm ? (
        <div className="card p-4 space-y-3">
          <h4 className="font-medium">Add New Webhook</h4>
          
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium mb-1">Session</label>
              <select
                value={formData.sessionId}
                onChange={(e) => setFormData({ ...formData, sessionId: e.target.value || null })}
                className="input w-full"
              >
                <option value="">All Sessions (Global)</option>
                {sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.session_id} {s.phone_number ? `(${s.phone_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Webhook URL *</label>
            <input
              type="url"
              value={formData.webhookUrl}
              onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
              placeholder="https://your-webhook-url.com/webhook"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Events</label>
            <div className="space-y-2">
              {availableEvents.map((event) => (
                <label key={event.value} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.events.includes(event.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, events: [...formData.events, event.value] });
                      } else {
                        setFormData({ ...formData, events: formData.events.filter(ev => ev !== event.value) });
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{event.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Message Direction</label>
            <select
              value={formData.directionFilter}
              onChange={(e) => setFormData({ ...formData, directionFilter: e.target.value })}
              className="input w-full"
            >
              <option value="both">Both (Incoming & Outgoing)</option>
              <option value="incoming">Incoming Only</option>
              <option value="outgoing">Outgoing Only</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Choose which message directions to forward to this webhook
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="btn btn-primary flex-1"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({
                  sessionId: sessionId || '',
                  webhookUrl: '',
                  events: ['message'],
                  isActive: true
                });
              }}
              className="btn btn-secondary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="btn btn-primary w-full flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Webhook
        </button>
      )}

      {/* Webhooks List */}
      <div className="space-y-3">
        {webhooks.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            <LinkIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No webhooks configured</p>
            <p className="text-sm mt-1">Add a webhook to receive real-time notifications</p>
          </div>
        ) : (
          webhooks.map((webhook) => (
            <div key={webhook.id} className="card p-4">
              {editingId === webhook.id ? (
                <EditWebhookForm
                  webhook={webhook}
                  sessions={sessions}
                  isAdmin={isAdmin}
                  onSave={(updates) => handleUpdate(webhook.id, updates)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <LinkIcon className="w-4 h-4 text-gray-500" />
                        <span className="font-medium break-all">{webhook.webhook_url}</span>
                      </div>
                      <div className="text-sm text-gray-500 space-y-1">
                        {webhook.session_id ? (
                          <div>Session: <span className="font-medium">{webhook.session_id}</span></div>
                        ) : (
                          <div>Scope: <span className="font-medium">Global (All Sessions)</span></div>
                        )}
                        <div>
                          Events: <span className="font-medium">
                            {Array.isArray(webhook.events) 
                              ? webhook.events.join(', ') 
                              : (typeof webhook.events === 'string' ? JSON.parse(webhook.events).join(', ') : 'message')}
                          </span>
                        </div>
                        <div>
                          Direction: <span className="font-medium">
                            {webhook.direction_filter === 'incoming' ? 'Incoming Only' :
                             webhook.direction_filter === 'outgoing' ? 'Outgoing Only' :
                             'Both (Incoming & Outgoing)'}
                          </span>
                        </div>
                        <div>
                          Status: <span className={`font-medium ${webhook.is_active ? 'text-green-600' : 'text-gray-500'}`}>
                            {webhook.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(webhook)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title={webhook.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {webhook.is_active ? (
                          <ToggleRight className="w-5 h-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => setEditingId(webhook.id)}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(webhook.id)}
                        className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EditWebhookForm({ webhook, sessions, isAdmin, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    webhookUrl: webhook.webhook_url,
    events: Array.isArray(webhook.events) 
      ? webhook.events 
      : (typeof webhook.events === 'string' ? JSON.parse(webhook.events) : ['message']),
    directionFilter: webhook.direction_filter || 'both',
    isActive: webhook.is_active
  });

  const availableEvents = [
    { value: 'message', label: 'Message' },
    { value: 'message_reaction', label: 'Message Reaction' },
    { value: 'message_revoked', label: 'Message Revoked' },
    { value: 'status_update', label: 'Status Update' }
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">Webhook URL *</label>
        <input
          type="url"
          value={formData.webhookUrl}
          onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Events</label>
        <div className="space-y-2">
          {availableEvents.map((event) => (
            <label key={event.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.events.includes(event.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData({ ...formData, events: [...formData.events, event.value] });
                  } else {
                    setFormData({ ...formData, events: formData.events.filter(ev => ev !== event.value) });
                  }
                }}
                className="rounded"
              />
              <span className="text-sm">{event.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Message Direction</label>
        <select
          value={formData.directionFilter}
          onChange={(e) => setFormData({ ...formData, directionFilter: e.target.value })}
          className="input w-full"
        >
          <option value="both">Both (Incoming & Outgoing)</option>
          <option value="incoming">Incoming Only</option>
          <option value="outgoing">Outgoing Only</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Choose which message directions to forward to this webhook
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`active-${webhook.id}`}
          checked={formData.isActive}
          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          className="rounded"
        />
        <label htmlFor={`active-${webhook.id}`} className="text-sm font-medium">
          Active
        </label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(formData)}
          className="btn btn-primary flex-1"
        >
          <Save className="w-4 h-4 mr-2" />
          Save
        </button>
        <button
          onClick={onCancel}
          className="btn btn-secondary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

