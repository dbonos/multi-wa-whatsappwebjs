import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Messages from './pages/Messages';
import Broadcast from './pages/Broadcast';
import Status from './pages/Status';
import Contacts from './pages/Contacts';
import SkipMessages from './pages/SkipMessages';
import Statistics from './pages/Statistics';
import ChangePassword from './pages/ChangePassword';
import AdminMenuPermissions from './pages/AdminMenuPermissions';
import ActivityLogs from './pages/ActivityLogs';

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <Layout>
              <Messages />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/broadcast"
        element={
          <ProtectedRoute>
            <Layout>
              <Broadcast />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/status"
        element={
          <ProtectedRoute>
            <Layout>
              <Status />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <Layout>
              <Contacts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/skip-messages"
        element={
          <ProtectedRoute>
            <Layout>
              <SkipMessages />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/statistics"
        element={
          <ProtectedRoute>
            <Layout>
              <Statistics />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <Layout>
              <ChangePassword />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/menu-permissions"
        element={
          <ProtectedRoute>
            <Layout>
              <AdminMenuPermissions />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/activity-logs"
        element={
          <ProtectedRoute>
            <Layout>
              <ActivityLogs />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster 
            position="top-right"
            richColors
            closeButton
            duration={4000}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
