import { useState, useEffect } from 'react';
import { statisticsAPI } from '../services/api';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Plus, Trash2, Save, X, Clock, Phone, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function StatisticsSettings({ sessionId, onClose }) {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    is_enabled: false,
    recipient_phone: '',
    send_time: '08:00:00',
    periods: [
      { start: '00:00', end: '08:00', label: 'Malam' },
      { start: '08:00', end: '17:00', label: 'Pagi-Siang' },
      { start: '17:00', end: '21:00', label: 'Sore' },
      { start: '21:00', end: '23:59', label: 'Malam' },
    ],
  });

  useEffect(() => {
    if (sessionId) {
      loadSettings();
    }
  }, [sessionId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await statisticsAPI.getSettings(sessionId);
      if (response.data.settings) {
        setSettings({
          is_enabled: response.data.settings.is_enabled || false,
          recipient_phone: response.data.settings.recipient_phone || '',
          send_time: response.data.settings.send_time || '08:00:00',
          periods: response.data.settings.periods || settings.periods,
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (settings.is_enabled && !settings.recipient_phone.trim()) {
      toast.error('Recipient phone is required when enabled');
      return;
    }

    // Validate periods
    if (settings.periods.length === 0) {
      toast.error('At least one period is required');
      return;
    }

    if (settings.periods.length > 5) {
      toast.error('Maximum 5 periods allowed');
      return;
    }

    // Validate each period
    for (let i = 0; i < settings.periods.length; i++) {
      const period = settings.periods[i];
      if (!period.start || !period.end || !period.label) {
        toast.error(`Period ${i + 1} must have start, end, and label`);
        return;
      }

      const [startHour, startMin] = period.start.split(':').map(Number);
      const [endHour, endMin] = period.end.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes >= endMinutes) {
        toast.error(`Period ${i + 1}: start time must be before end time`);
        return;
      }
    }

    // Check for overlaps
    const sortedPeriods = [...settings.periods].sort((a, b) => {
      const [aHour, aMin] = a.start.split(':').map(Number);
      const [bHour, bMin] = b.start.split(':').map(Number);
      return (aHour * 60 + aMin) - (bHour * 60 + bMin);
    });

    for (let i = 0; i < sortedPeriods.length - 1; i++) {
      const current = sortedPeriods[i];
      const next = sortedPeriods[i + 1];
      
      const [currentEndHour, currentEndMin] = current.end.split(':').map(Number);
      const [nextStartHour, nextStartMin] = next.start.split(':').map(Number);
      const currentEndMinutes = currentEndHour * 60 + currentEndMin;
      const nextStartMinutes = nextStartHour * 60 + nextStartMin;

      if (currentEndMinutes > nextStartMinutes) {
        toast.error(`Periods overlap: ${current.label} and ${next.label}`);
        return;
      }
    }

    try {
      setSaving(true);
      await statisticsAPI.updateSettings(sessionId, settings);
      toast.success('Settings saved successfully');
      if (onClose) onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const addPeriod = () => {
    if (settings.periods.length >= 5) {
      toast.error('Maximum 5 periods allowed');
      return;
    }

    const lastPeriod = settings.periods[settings.periods.length - 1];
    const [lastEndHour, lastEndMin] = lastPeriod.end.split(':').map(Number);
    const nextStartHour = (lastEndHour + 1) % 24;
    const nextStart = `${String(nextStartHour).padStart(2, '0')}:${String(lastEndMin).padStart(2, '0')}`;
    const nextEnd = `${String((nextStartHour + 4) % 24).padStart(2, '0')}:${String(lastEndMin).padStart(2, '0')}`;

    setSettings({
      ...settings,
      periods: [
        ...settings.periods,
        { start: nextStart, end: nextEnd, label: `Periode ${settings.periods.length + 1}` },
      ],
    });
  };

  const removePeriod = (index) => {
    if (settings.periods.length <= 1) {
      toast.error('At least one period is required');
      return;
    }

    setSettings({
      ...settings,
      periods: settings.periods.filter((_, i) => i !== index),
    });
  };

  const updatePeriod = (index, field, value) => {
    const newPeriods = [...settings.periods];
    newPeriods[index] = { ...newPeriods[index], [field]: value };
    setSettings({ ...settings, periods: newPeriods });
  };

  if (loading) {
    return (
      <div className="card p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Statistics Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable Statistics</label>
            <button
              onClick={() => setSettings({ ...settings, is_enabled: !settings.is_enabled })}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {settings.is_enabled ? (
                <ToggleRight className="w-6 h-6 text-green-600" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-gray-400" />
              )}
            </button>
          </div>

          {/* Recipient Phone */}
          <div>
            <label className="block text-sm font-medium mb-1">Recipient Phone Number</label>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={settings.recipient_phone}
                onChange={(e) => setSettings({ ...settings, recipient_phone: e.target.value })}
                placeholder="6281234567890"
                className="input flex-1"
                disabled={!settings.is_enabled}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              WhatsApp number to receive daily statistics (without + or spaces)
            </p>
          </div>

          {/* Send Time */}
          <div>
            <label className="block text-sm font-medium mb-1">Send Time</label>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <input
                type="time"
                value={settings.send_time}
                onChange={(e) => setSettings({ ...settings, send_time: e.target.value })}
                className="input"
                disabled={!settings.is_enabled}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Time to send daily statistics (WIB)</p>
          </div>

          {/* Periods Configuration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Periods Configuration</label>
              <Button
                onClick={addPeriod}
                disabled={settings.periods.length >= 5}
                size="sm"
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Period
              </Button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Configure up to 5 time periods for statistics (min 1 period)
            </p>

            <div className="space-y-3">
              {settings.periods.map((period, index) => (
                <div key={index} className="card p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Period {index + 1}</span>
                    {settings.periods.length > 1 && (
                      <button
                        onClick={() => removePeriod(index)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={period.start}
                        onChange={(e) => updatePeriod(index, 'start', e.target.value)}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Time</label>
                      <input
                        type="time"
                        value={period.end}
                        onChange={(e) => updatePeriod(index, 'end', e.target.value)}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Label</label>
                      <input
                        type="text"
                        value={period.label}
                        onChange={(e) => updatePeriod(index, 'label', e.target.value)}
                        placeholder="e.g., Pagi"
                        className="input text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-2 pt-4">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
            {onClose && (
              <Button onClick={onClose} variant="outline">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

