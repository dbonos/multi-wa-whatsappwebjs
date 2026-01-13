import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { statisticsAPI, sessionsAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import StatisticsSettings from '../components/StatisticsSettings';
import { ResponseTimeChart, CustomerCountChart, PeriodComparisonChart } from '../components/StatisticsCharts';
import {
  BarChart3,
  RefreshCw,
  Calendar,
  Settings,
  Send,
  Clock,
  Users,
  MessageSquare,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export default function Statistics() {
  const { user, isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [statistics, setStatistics] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadSessions();
    
    // Set default date to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setSelectedDate(yesterday.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (selectedSession && selectedDate) {
      loadStatistics();
    }
  }, [selectedSession, selectedDate]);

  const loadSessions = async () => {
    try {
      const response = await sessionsAPI.list();
      const sessionsList = response.data?.sessions || response.data || [];
      setSessions(sessionsList);
      
      if (sessionsList.length > 0 && !selectedSession) {
        // Admin can select any, user can only select their own
        const availableSessions = isAdmin 
          ? sessionsList 
          : sessionsList.filter(s => s.session_id === user?.session_id);
        
        if (availableSessions.length > 0) {
          setSelectedSession(availableSessions[0].session_id);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      toast.error('Failed to load sessions');
    }
  };

  const loadStatistics = async () => {
    if (!selectedSession || !selectedDate) return;

    try {
      setLoading(true);
      const response = await statisticsAPI.get(selectedSession, selectedDate);
      setStatistics(response.data.statistics || []);
      setPeriods(response.data.periods || []);
    } catch (error) {
      console.error('Failed to load statistics:', error);
      toast.error('Failed to load statistics: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSendStatistics = async () => {
    if (!selectedSession || !selectedDate) {
      toast.error('Please select session and date');
      return;
    }

    try {
      setSending(true);
      await statisticsAPI.send(selectedSession, selectedDate);
      toast.success('Statistics sent successfully');
    } catch (error) {
      console.error('Failed to send statistics:', error);
      toast.error('Failed to send statistics: ' + (error.response?.data?.error || error.message));
    } finally {
      setSending(false);
    }
  };

  const handleSettingsSave = (newPeriods) => {
    // Refresh statistics to get updated periods from backend
    loadStatistics();
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds === 0) return '0 menit';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes === 0) return `${secs} detik`;
    if (secs === 0) return `${minutes} menit`;
    return `${minutes} menit ${secs} detik`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-whatsapp" />
            Statistik Responsivitas
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Analisis response time hotline center per periode
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button
              onClick={() => setShowSettings(!showSettings)}
              variant="outline"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button
              onClick={handleSendStatistics}
              disabled={sending || !selectedSession}
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Statistics
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && isAdmin && selectedSession && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <StatisticsSettings
            sessionId={selectedSession}
            onClose={() => setShowSettings(false)}
            onSave={handleSettingsSave}
          />
        </motion.div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Session</label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="input w-full"
              >
                <option value="">Select Session</option>
                {sessions
                  .filter(s => isAdmin || s.session_id === user?.session_id)
                  .map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.session_id} {session.phone_number ? `(${session.phone_number})` : ''}
                    </option>
                  ))}
              </select>
            </div>
            <div className="min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Date</label>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="input flex-1"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <Button onClick={loadStatistics} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Display */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : statistics.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No statistics available for selected date</p>
            <p className="text-sm mt-1">Select a different date or session</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResponseTimeChart data={statistics} periods={periods} />
            <CustomerCountChart data={statistics} periods={periods} />
          </div>

          <PeriodComparisonChart data={statistics} periods={periods} />

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {statistics.map((stat, index) => {
              const period = periods[index];
              return (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {period?.label || `Periode ${index + 1}`}
                    </CardTitle>
                    <p className="text-sm text-gray-500">
                      {period?.start} - {period?.end}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* New Customer */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">New Customer</span>
                      </div>
                      <div className="pl-6 space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Rata-rata: {formatTime(stat.new_customer?.avg_response_time_seconds || 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3 h-3 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Jumlah: {stat.new_customer?.count || 0} customer
                          </span>
                        </div>
                        {stat.new_customer?.unreplied_count > 0 && (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span className="text-sm text-red-600 dark:text-red-400">
                              Tidak dibalas: {stat.new_customer.unreplied_count} customer
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Previous Customer */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium">Previous Customer</span>
                      </div>
                      <div className="pl-6 space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Rata-rata: {formatTime(stat.previous_customer?.avg_response_time_seconds || 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-3 h-3 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Jumlah: {stat.previous_customer?.count || 0} customer
                          </span>
                        </div>
                        {stat.previous_customer?.unreplied_count > 0 && (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span className="text-sm text-red-600 dark:text-red-400">
                              Tidak dibalas: {stat.previous_customer.unreplied_count} customer
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

