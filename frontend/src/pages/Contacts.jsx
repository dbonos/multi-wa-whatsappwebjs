import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { contactsAPI, sessionsAPI, messagesAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Input } from '../components/ui/input';
import {
  Search,
  User,
  Phone,
  Mail,
  MessageSquare,
  Download,
  Loader2,
  Users,
  Building2,
  UserCheck,
  X,
  Info,
} from 'lucide-react';

export default function Contacts() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactMessages, setContactMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [stats, setStats] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      setCurrentPage(1);
      loadContacts(1);
    }
  }, [selectedSession, searchQuery]);

  useEffect(() => {
    if (selectedSession && currentPage > 1) {
      loadContacts(currentPage);
    }
  }, [currentPage]);

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
      toast.error('Failed to load sessions');
    }
  };

  const loadContacts = async (page = 1) => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      const params = {
        sessionId: selectedSession,
        limit: pageSize,
        offset,
        search: searchQuery.trim() || undefined,
      };
      const response = await contactsAPI.list(params);
      setContacts(response.data.contacts || []);
      setStats(response.data.stats || {});
      setTotalPages(Math.ceil((response.data.total || 0) / pageSize));
    } catch (error) {
      console.error('Failed to load contacts:', error);
      toast.error('Failed to load contacts: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const loadContactDetails = async (contactId) => {
    try {
      setLoadingMessages(true);
      const response = await contactsAPI.get(contactId, selectedSession);
      setSelectedContact(response.data.contact);
      setContactMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to load contact details:', error);
      toast.error('Failed to load contact details');
    } finally {
      setLoadingMessages(false);
    }
  };

  const exportContacts = () => {
    const csvContent = [
      ['Name', 'Phone Number', 'Contact ID', 'Type', 'Business', 'Group', 'Message Count'].join(','),
      ...contacts.map(c => [
        `"${c.name || c.pushname || ''}"`,
        c.phone_number || '',
        c.contact_id || '',
        c.lid_original ? 'LID' : 'C.US',
        c.is_business ? 'Yes' : 'No',
        c.is_group ? 'Yes' : 'No',
        c.message_count || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts_${selectedSession}_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Contacts exported successfully!');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
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
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Contacts</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Manage and view your WhatsApp contacts</p>
      </motion.div>

      {/* Session Selector */}
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
      >
        <Card>
          <CardContent className="p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Session
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-whatsapp"
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
      </motion.div>

      {/* Statistics */}
      {selectedSession && stats.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-5 gap-4"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-500" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-5 h-5 text-green-500" />
                <p className="text-sm text-gray-600 dark:text-gray-400">With Phone</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.with_phone || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-yellow-500" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Without Phone</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.without_phone || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-purple-500" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Business</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.business || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-indigo-500" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Groups</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.groups || 0}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Search and Actions */}
      {selectedSession && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, phone, or contact ID..."
                    className="pl-10"
                  />
                </div>
                <Button onClick={exportContacts} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Contacts List */}
      {selectedSession && (
        <Card>
          <CardHeader>
            <CardTitle>Contacts List</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && currentPage === 1 ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                {searchQuery ? 'No contacts found matching your search' : 'No contacts found'}
              </div>
            ) : (
              <>
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-3"
                >
                  {contacts.map((contact) => (
                    <motion.div
                      key={contact.id}
                      variants={itemVariants}
                      whileHover={{ scale: 1.01 }}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      onClick={() => loadContactDetails(contact.contact_id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-whatsapp rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {(contact.name || contact.pushname || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {contact.name || contact.pushname || 'Unknown'}
                            </h3>
                            {contact.is_business && (
                              <Badge variant="info" className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                Business
                              </Badge>
                            )}
                            {contact.is_group && (
                              <Badge variant="secondary">Group</Badge>
                            )}
                            {contact.lid_original && (
                              <Badge variant="warning">LID</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            {contact.phone_number && (
                              <div className="flex items-center gap-1">
                                <Phone className="w-4 h-4" />
                                {contact.phone_number}
                              </div>
                            )}
                            {contact.message_count > 0 && (
                              <div className="flex items-center gap-1">
                                <MessageSquare className="w-4 h-4" />
                                {contact.message_count} messages
                              </div>
                            )}
                          </div>
                          {contact.contact_id && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
                              ID: {contact.contact_id}
                            </p>
                          )}
                        </div>
                        <Info className="w-5 h-5 text-gray-400" />
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contact Detail Modal */}
      <AnimatePresence>
        {selectedContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedContact(null)}
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
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-whatsapp rounded-full flex items-center justify-center text-white font-bold text-2xl">
                    {(selectedContact.name || selectedContact.pushname || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {selectedContact.name || selectedContact.pushname || 'Unknown'}
                    </h2>
                    {selectedContact.phone_number && (
                      <p className="text-gray-600 dark:text-gray-400">{selectedContact.phone_number}</p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedContact(null)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Contact Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Contact ID</p>
                      <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{selectedContact.contact_id}</p>
                    </div>
                    {selectedContact.phone_number && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Phone Number</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{selectedContact.phone_number}</p>
                      </div>
                    )}
                    {selectedContact.lid_original && (
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">LID Original</p>
                        <p className="font-mono text-sm text-gray-900 dark:text-gray-100">{selectedContact.lid_original}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {selectedContact.is_business && (
                        <Badge variant="info">Business Account</Badge>
                      )}
                      {selectedContact.is_group && (
                        <Badge variant="secondary">Group</Badge>
                      )}
                      {selectedContact.is_my_contact && (
                        <Badge variant="success">My Contact</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Messages */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Messages ({contactMessages.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingMessages ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : contactMessages.length === 0 ? (
                      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                        No messages found
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {contactMessages.map((msg) => (
                          <div key={msg.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant={msg.direction === 'incoming' ? 'info' : 'secondary'}>
                                {msg.direction}
                              </Badge>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(msg.timestamp * 1000).toLocaleString('id-ID', {
                                  timeZone: 'Asia/Jakarta',
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                  hour12: false
                                })}
                              </span>
                            </div>
                            <p className="text-gray-900 dark:text-gray-100">
                              {msg.body || msg.caption || '(Media)'}
                            </p>
                            {msg.message_type !== 'text' && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Type: {msg.message_type}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

