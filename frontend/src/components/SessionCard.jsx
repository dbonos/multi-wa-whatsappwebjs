import { useState } from 'react';
import { sessionsAPI } from '../services/api';
import QRScanner from './QRScanner';
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader2,
  QrCode,
  Trash2,
  RefreshCw,
} from 'lucide-react';

const statusConfig = {
  ready: { color: 'green', icon: CheckCircle2, label: 'Ready' },
  authenticated: { color: 'blue', icon: CheckCircle2, label: 'Authenticated' },
  qr_generated: { color: 'yellow', icon: Loader2, label: 'QR Generated' },
  initializing: { color: 'gray', icon: Loader2, label: 'Initializing' },
  disconnected: { color: 'red', icon: XCircle, label: 'Disconnected' },
  stopped: { color: 'gray', icon: XCircle, label: 'Stopped' },
};

export default function SessionCard({ session, onDelete, onRefresh }) {
  const [showQR, setShowQR] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState(session.realtime_status || session.status);

  const StatusIcon = statusConfig[status]?.icon || Loader2;
  const statusColor = statusConfig[status]?.color || 'gray';

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete session "${session.session_id}"?`)) {
      return;
    }

    setDeleting(true);
    try {
      await sessionsAPI.delete(session.session_id);
      onDelete?.(session.session_id);
    } catch (error) {
      alert('Failed to delete session: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeleting(false);
    }
  };

  const handleRefresh = async () => {
    try {
      const response = await sessionsAPI.getStatus(session.session_id);
      setStatus(response.data.status);
      onRefresh?.(session.session_id);
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  };

  return (
    <>
      <div className="card hover:shadow-lg transition-shadow">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${
              statusColor === 'green' ? 'bg-green-100' :
              statusColor === 'red' ? 'bg-red-100' :
              statusColor === 'yellow' ? 'bg-yellow-100' :
              'bg-gray-100'
            } flex items-center justify-center`}>
              <Smartphone className={`w-6 h-6 ${
                statusColor === 'green' ? 'text-green-600' :
                statusColor === 'red' ? 'text-red-600' :
                statusColor === 'yellow' ? 'text-yellow-600' :
                'text-gray-600'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{session.session_id}</h3>
              <p className="text-sm text-gray-500">
                {session.phone_number || 'Not connected'}
              </p>
            </div>
          </div>
          <div className={`badge ${
            statusColor === 'green' ? 'badge-success' :
            statusColor === 'red' ? 'badge-danger' :
            statusColor === 'yellow' ? 'badge-warning' :
            'badge-info'
          }`}>
            <StatusIcon className={`w-3 h-3 mr-1 ${status === 'initializing' || status === 'qr_generated' ? 'animate-spin' : ''}`} />
            {statusConfig[status]?.label || status}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <p className="text-gray-500">Messages</p>
            <p className="font-semibold text-gray-900">{session.message_count || 0}</p>
          </div>
          <div>
            <p className="text-gray-500">Contacts</p>
            <p className="font-semibold text-gray-900">{session.contact_count || 0}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {status === 'qr_generated' || status === 'initializing' ? (
            <button
              onClick={() => setShowQR(true)}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              Show QR
            </button>
          ) : status === 'ready' ? (
            <button
              onClick={handleRefresh}
              className="btn btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          ) : null}

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn btn-danger flex items-center justify-center gap-2 px-4"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {showQR && (
        <QRScanner
          sessionId={session.session_id}
          onClose={() => setShowQR(false)}
          onReady={() => {
            setShowQR(false);
            setStatus('ready');
            handleRefresh();
          }}
        />
      )}
    </>
  );
}

