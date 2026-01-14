import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { skipMessagesAPI, sessionsAPI, contactsAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import {
  Ban,
  Users,
  User,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Search,
  X,
} from 'lucide-react';

export default function SkipMessages() {
  const { user, isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [skipList, setSkipList] = useState([]);
  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list'); // 'list', 'groups', 'contacts'
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      loadSkipList();
      if (activeTab === 'groups') {
        loadGroups();
      } else if (activeTab === 'contacts') {
        loadContacts();
      }
    }
  }, [selectedSession, activeTab]);

  const loadSessions = async () => {
    try {
      const response = await sessionsAPI.list();
      const sessionsList = response.data?.sessions || response.data || [];
      const readySessions = sessionsList.filter(
        (s) => s.realtime_status === 'ready' || s.status === 'ready'
      );
      setSessions(readySessions);
      
      if (readySessions.length > 0 && !selectedSession) {
        const firstSessionId = readySessions[0].session_id;
        setSelectedSession(firstSessionId);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('Failed to load sessions');
    }
  };

  const loadSkipList = async () => {
    try {
      setLoading(true);
      const response = await skipMessagesAPI.list({ sessionId: selectedSession });
      setSkipList(response.data.skipList || []);
    } catch (error) {
      console.error('Failed to load skip list:', error);
      toast.error('Failed to load skip list');
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      console.log('📋 [SKIP MESSAGES] Loading groups for session:', selectedSession);
      const response = await skipMessagesAPI.getGroups(selectedSession);
      console.log('📋 [SKIP MESSAGES] Groups response:', response.data);
      setGroups(response.data.groups || []);
      if (response.data.groups && response.data.groups.length === 0) {
        console.warn('⚠️ [SKIP MESSAGES] No groups found for session:', selectedSession);
      }
    } catch (error) {
      console.error('❌ [SKIP MESSAGES] Failed to load groups:', error);
      console.error('❌ [SKIP MESSAGES] Error details:', error.response?.data || error.message);
      toast.error('Failed to load groups: ' + (error.response?.data?.error || error.message));
    }
  };

  const loadContacts = async () => {
    try {
      const response = await contactsAPI.list({ 
        sessionId: selectedSession, 
        limit: 1000 
      });
      setContacts(response.data.contacts || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      toast.error('Failed to load contacts');
    }
  };

  const handleToggleGroup = async (group) => {
    try {
      // Add to skip list (groups shown here are not yet skipped)
      await skipMessagesAPI.add({
        sessionId: selectedSession,
        type: 'group',
        groupId: group.group_id,
        name: group.name || group.pushname || 'Group',
      });
      toast.success('Group added to skip list');
      await loadSkipList();
      await loadGroups(); // Reload to remove from list
    } catch (error) {
      console.error('Error adding group to skip list:', error);
      toast.error(error.response?.data?.error || 'Failed to add group to skip list');
    }
  };

  const handleToggleContact = async (contact) => {
    try {
      const skipRule = skipList.find(
        s => (s.contact_id === contact.contact_id || s.phone_number === contact.phone_number) && s.type === 'contact'
      );
      
      if (skipRule) {
        await skipMessagesAPI.delete(skipRule.id);
        toast.success('Contact removed from skip list');
      } else {
        await skipMessagesAPI.add({
          sessionId: selectedSession,
          type: 'contact',
          contactId: contact.contact_id,
          phoneNumber: contact.phone_number,
          name: contact.name || contact.pushname || contact.phone_number,
        });
        toast.success('Contact added to skip list');
      }
      await loadSkipList();
    } catch (error) {
      console.error('Error toggling contact:', error);
      toast.error(error.response?.data?.error || 'Failed to toggle contact');
    }
  };

  const handleAddManualContact = async () => {
    if (!newContactPhone.trim()) {
      toast.error('Phone number is required');
      return;
    }

    try {
      await skipMessagesAPI.add({
        sessionId: selectedSession,
        type: 'contact',
        phoneNumber: newContactPhone.trim(),
        name: newContactName.trim() || newContactPhone.trim(),
      });
      toast.success('Contact added to skip list');
      setNewContactPhone('');
      setNewContactName('');
      setShowAddContact(false);
      await loadSkipList();
    } catch (error) {
      console.error('Error adding contact:', error);
      toast.error(error.response?.data?.error || 'Failed to add contact');
    }
  };

  const handleToggleSkipRule = async (skipRule) => {
    try {
      await skipMessagesAPI.update(skipRule.id, { isActive: !skipRule.is_active });
      toast.success(`Skip rule ${skipRule.is_active ? 'deactivated' : 'activated'}`);
      await loadSkipList();
    } catch (error) {
      console.error('Error toggling skip rule:', error);
      toast.error('Failed to toggle skip rule');
    }
  };

  const handleDeleteSkipRule = async (skipRule) => {
    if (!confirm(`Are you sure you want to remove "${skipRule.name || skipRule.group_id || skipRule.phone_number}" from skip list?`)) {
      return;
    }

    try {
      await skipMessagesAPI.delete(skipRule.id);
      toast.success('Skip rule removed');
      await loadSkipList();
      if (activeTab === 'groups') {
        await loadGroups();
      }
    } catch (error) {
      console.error('Error deleting skip rule:', error);
      toast.error('Failed to delete skip rule');
    }
  };

  const filteredSkipList = skipList.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(query)) ||
      (item.group_id && item.group_id.toLowerCase().includes(query)) ||
      (item.phone_number && item.phone_number.includes(query)) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  });

  const filteredGroups = groups.filter(group => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (group.name && group.name.toLowerCase().includes(query)) ||
      (group.pushname && group.pushname.toLowerCase().includes(query)) ||
      (group.group_id && group.group_id.toLowerCase().includes(query))
    );
  });

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (contact.name && contact.name.toLowerCase().includes(query)) ||
      (contact.pushname && contact.pushname.toLowerCase().includes(query)) ||
      (contact.phone_number && contact.phone_number.includes(query))
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Skip Messages</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Skip saving messages from specific groups or contacts to database
        </p>
      </div>

      {/* Session Selector */}
      <Card>
        <CardContent className="pt-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
        </CardContent>
      </Card>

      {selectedSession && (
        <>
          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'list'
                  ? 'border-b-2 border-whatsapp text-whatsapp'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Skip List ({skipList.length})
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'groups'
                  ? 'border-b-2 border-whatsapp text-whatsapp'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Groups ({groups.length})
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'contacts'
                  ? 'border-b-2 border-whatsapp text-whatsapp'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Contacts ({contacts.length})
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Content */}
          {activeTab === 'list' && (
            <Card>
              <CardHeader>
                <CardTitle>Skip List</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredSkipList.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No skip rules found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredSkipList.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1 min-w-0">
                            {item.type === 'group' ? (
                              <Users className="w-4 h-4 text-gray-500" />
                            ) : (
                              <User className="w-4 h-4 text-gray-500" />
                            )}
                            <span className="font-medium truncate min-w-0">
                              {item.name || item.group_id || item.phone_number}
                            </span>
                            <Badge variant={item.is_active ? 'destructive' : 'secondary'}>
                              {item.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant="outline">{item.type}</Badge>
                          </div>
                          {item.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
                              {item.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Created: {new Date(item.created_at).toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: false
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                          <button
                            onClick={() => handleToggleSkipRule(item)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            title={item.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {item.is_active ? (
                              <ToggleRight className="w-5 h-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteSkipRule(item)}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'groups' && (
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp Groups</CardTitle>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Select groups to skip saving messages (only shows groups not yet skipped)
                </p>
              </CardHeader>
              <CardContent>
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    {skipList.filter(s => s.type === 'group' && s.is_active).length > 0 
                      ? 'All groups are already in skip list' 
                      : 'No groups found'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredGroups.map((group) => (
                      <div
                        key={group.group_id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <div className="flex-1 min-w-0 flex items-center gap-3">
                          {/* Profile Picture */}
                          {group.profile_picture_url ? (
                            <img
                              src={group.profile_picture_url}
                              alt={group.name || group.pushname || 'Group'}
                              className="w-10 h-10 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div className={`w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center ${group.profile_picture_url ? 'hidden' : ''}`}>
                            <Users className="w-5 h-5 text-gray-500" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 min-w-0">
                              <span className="font-medium truncate min-w-0">{group.name || group.pushname || 'Group'}</span>
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {group.message_count || 0} messages • Last: {group.last_message_time ? new Date(group.last_message_time * 1000).toLocaleString('id-ID', {
                                timeZone: 'Asia/Jakarta',
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false
                              }) : 'Never'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleToggleGroup(group)}
                          className="px-4 py-2 rounded-lg transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0 w-full sm:w-auto"
                        >
                          Skip Messages
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === 'contacts' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Contacts</CardTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Toggle to skip saving messages from contacts
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowAddContact(!showAddContact)}
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Manual
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {showAddContact && (
                  <div className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <h3 className="font-medium mb-3">Add Manual Contact</h3>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        placeholder="Phone number (e.g., 6281234567890)"
                        className="input"
                      />
                      <input
                        type="text"
                        value={newContactName}
                        onChange={(e) => setNewContactName(e.target.value)}
                        placeholder="Name (optional)"
                        className="input"
                      />
                      <div className="flex gap-2">
                        <Button onClick={handleAddManualContact} size="sm">
                          Add
                        </Button>
                        <Button
                          onClick={() => {
                            setShowAddContact(false);
                            setNewContactPhone('');
                            setNewContactName('');
                          }}
                          variant="outline"
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {filteredContacts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No contacts found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredContacts.map((contact) => {
                      const isSkipped = skipList.some(
                        s => (s.contact_id === contact.contact_id || s.phone_number === contact.phone_number) && s.type === 'contact' && s.is_active
                      );
                      return (
                        <div
                          key={contact.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1 min-w-0">
                              <User className="w-4 h-4 text-gray-500" />
                              <span className="font-medium truncate min-w-0">
                                {contact.name || contact.pushname || contact.phone_number || 'Unknown'}
                              </span>
                              {isSkipped && (
                                <Badge variant="destructive">Skipped</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 break-words">
                              {contact.phone_number || contact.contact_id}
                            </p>
                          </div>
                          <button
                            onClick={() => handleToggleContact(contact)}
                            className={`px-4 py-2 rounded-lg transition-colors flex-shrink-0 w-full sm:w-auto ${
                              isSkipped
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {isSkipped ? 'Remove from Skip' : 'Skip Messages'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </motion.div>
  );
}

