import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { usersAPI, menuPermissionsAPI } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Search, ShieldCheck, User, CheckCircle2, XCircle } from 'lucide-react';

const MENU_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard', description: 'Overview & session cards' },
  { key: 'messages', label: 'Messages', description: 'Incoming/outgoing messages' },
  { key: 'contacts', label: 'Contacts', description: 'Contact list & details' },
  { key: 'skip-messages', label: 'Skip Messages', description: 'Skip list configuration' },
  { key: 'statistics', label: 'Statistics', description: 'Daily stats & charts' },
];

export default function AdminMenuPermissions() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        const response = await usersAPI.list();
        setUsers(response.data.users || []);
        if (response.data.users?.length > 0) {
          setSelectedUserId(response.data.users[0].id);
        }
      } catch (error) {
        toast.error('Failed to load users');
      } finally {
        setLoadingUsers(false);
      }
    };
    loadUsers();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const loadPermissions = async () => {
      if (!selectedUserId) return;
      try {
        setLoadingPermissions(true);
        const response = await menuPermissionsAPI.getUserPermissions(selectedUserId);
        const permissionsArray = response.data.permissions || [];
        const permissionMap = {};
        permissionsArray.forEach((p) => {
          permissionMap[p.menu_path] = !!p.is_visible;
        });

        // Default to true if not explicitly set
        MENU_OPTIONS.forEach((menu) => {
          if (permissionMap[menu.key] === undefined) {
            permissionMap[menu.key] = true;
          }
        });

        setPermissions(permissionMap);
      } catch (error) {
        toast.error('Failed to load permissions');
      } finally {
        setLoadingPermissions(false);
      }
    };
    loadPermissions();
  }, [selectedUserId]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((u) =>
      (u.username || '').toLowerCase().includes(query) ||
      (u.session_id || '').toLowerCase().includes(query) ||
      (u.phone_number || '').toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const togglePermission = (key) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const payload = MENU_OPTIONS.map((menu) => ({
        menu_path: menu.key,
        is_visible: !!permissions[menu.key],
      }));
      await menuPermissionsAPI.updateUserPermissions(selectedUserId, payload);
      toast.success('Menu permissions updated');
    } catch (error) {
      toast.error('Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="card text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600">Admin privileges are required to manage menu access.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Menu Access Control</h1>
          <p className="text-gray-600 mt-1">
            Manage which menus are visible for each session account
          </p>
        </div>
        <div className="flex items-center gap-2 text-whatsapp">
          <ShieldCheck className="w-5 h-5" />
          <span className="font-medium">Admin Only</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Users</CardTitle>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username, session, phone..."
                className="input pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingUsers ? (
              <div className="p-6 text-center text-gray-500">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No users found</div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto divide-y">
                {filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                      selectedUserId === user.id ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-whatsapp/10 text-whatsapp flex items-center justify-center font-bold">
                        {(user.username || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {user.username || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {user.session_id || 'No session'} • {user.role}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Permissions Panel */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Menu Permissions</CardTitle>
            {selectedUser && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span className="font-medium text-gray-900">{selectedUser.username}</span>
                <span>•</span>
                <span>{selectedUser.session_id || 'No session'}</span>
                <span>•</span>
                <span className="capitalize">{selectedUser.role}</span>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPermissions ? (
              <div className="text-center text-gray-500 py-10">Loading permissions...</div>
            ) : (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {MENU_OPTIONS.map((menu) => {
                    const enabled = permissions[menu.key];
                    return (
                      <div
                        key={menu.key}
                        className={`p-4 rounded-xl border transition-all ${
                          enabled
                            ? 'border-emerald-200 bg-emerald-50/50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{menu.label}</p>
                            <p className="text-sm text-gray-500">{menu.description}</p>
                          </div>
                          <button
                            onClick={() => togglePermission(menu.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                              enabled
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {enabled ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            {enabled ? 'Visible' : 'Hidden'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={handleSave}
                disabled={saving || !selectedUserId}
                className="bg-whatsapp hover:bg-whatsapp-dark text-white"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
