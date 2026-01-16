import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { menuPermissionsAPI } from '../services/api';
import {
  LayoutDashboard,
  MessageSquare,
  Radio,
  Image,
  LogOut,
  Menu,
  X,
  Settings,
  Sun,
  Moon,
  User,
  Key,
  Ban,
  BarChart3,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from './ui/button';

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuPermissions, setMenuPermissions] = useState({});

  useEffect(() => {
    // Fetch menu permissions for current user
    const fetchPermissions = async () => {
      try {
        const response = await menuPermissionsAPI.getMyPermissions();
        if (response.data.success) {
          setMenuPermissions(response.data.permissions || {});
        }
      } catch (error) {
        console.error('Failed to fetch menu permissions:', error);
        // Default: all menus visible if fetch fails
        setMenuPermissions({});
      }
    };

    if (user) {
      fetchPermissions();
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // All available menu items
  const allNavItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', adminOnly: false },
    { path: '/messages', icon: MessageSquare, label: 'Messages', adminOnly: false },
    { path: '/contacts', icon: User, label: 'Contacts', adminOnly: false },
    { path: '/skip-messages', icon: Ban, label: 'Skip Messages', adminOnly: false },
    { path: '/statistics', icon: BarChart3, label: 'Statistik', adminOnly: false },
    { path: '/broadcast', icon: Radio, label: 'Broadcast', adminOnly: true },
    { path: '/status', icon: Image, label: 'Status & Stories', adminOnly: true },
  ];

  // Filter menu items based on admin status and permissions
  const navItems = allNavItems.filter(item => {
    // Admin can see all admin-only items
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    
    // Check menu permissions (if permission exists and is false, hide it)
    // If permission doesn't exist, default to visible (backward compatibility)
    const menuKey = item.path.replace('/', '');
    if (menuPermissions.hasOwnProperty(menuKey)) {
      return menuPermissions[menuKey] !== false;
    }
    
    // Default: visible if no permission set
    return true;
  });

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-900">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-50 bg-white/80 dark:bg-gray-900/70 backdrop-blur border-b border-gray-200/70 dark:border-gray-700/70 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          <span className="text-whatsapp">WA</span> Manager
        </h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-xl hover:bg-gray-100/80 dark:hover:bg-gray-800/70 transition-colors"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <div className="flex w-full max-w-full overflow-x-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white/85 dark:bg-gray-900/80 backdrop-blur border-r border-gray-200/70 dark:border-gray-700/70 transition-transform duration-300 ease-in-out`}
        >
          <div className="h-full flex flex-col">
            {/* Logo */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-whatsapp text-white shadow-sm">
                  <MessageSquare className="w-5 h-5" />
                </span>
                <span className="text-gray-900 dark:text-gray-100">WA Manager</span>
              </h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                      isActive
                        ? 'bg-whatsapp text-white shadow-sm'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-gray-800/70'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User Info & Logout */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-center gap-3 px-4 py-2">
                <div className="w-10 h-10 bg-whatsapp rounded-full flex items-center justify-center text-white font-bold">
                  {user?.username?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user?.username || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {user?.role || 'user'}
                  </p>
                </div>
              </div>
              <Link
                to="/change-password"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <Key className="w-5 h-5" />
                <span className="font-medium">Change Password</span>
              </Link>
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-5 h-5 mr-3" />
                    Light Mode
                  </>
                ) : (
                  <>
                    <Moon className="w-5 h-5 mr-3" />
                    Dark Mode
                  </>
                )}
              </Button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-0 min-w-0 w-full max-w-full overflow-x-hidden">
          <div className="p-4 lg:p-8 w-full max-w-full overflow-x-hidden">
            <div className="mx-auto w-full max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

