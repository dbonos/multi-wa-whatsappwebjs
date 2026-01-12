import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { sessionsAPI } from '../services/api';
import socketService from '../services/socket';
import { Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

export default function QRScanner({ sessionId, onClose, onReady }) {
  const [qrCode, setQrCode] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    socketService.connect();
    socketService.joinSession(sessionId);

    // Listen for QR code updates
    const handleQRCode = (data) => {
      if (data.sessionId === sessionId) {
        setQrCode(data.qrCode);
        setStatus('qr_ready');
      }
    };

    // Listen for status updates
    const handleStatus = (data) => {
      if (data.sessionId === sessionId) {
        if (data.status === 'ready') {
          setStatus('ready');
          onReady?.();
        } else if (data.status === 'qr_generated') {
          setQrCode(data.qrCode);
          setStatus('qr_ready');
        }
      }
    };

    socketService.on('qr_code', handleQRCode);
    socketService.on('session_status', handleStatus);

    // Fetch initial QR code
    const fetchQR = async () => {
      try {
        const response = await sessionsAPI.getQR(sessionId);
        if (response.data.qrCode) {
          setQrCode(response.data.qrCode);
          setStatus('qr_ready');
        } else {
          setStatus('authenticated');
        }
      } catch (error) {
        if (error.response?.status === 404) {
          // QR not available yet, wait for socket update
          setStatus('waiting');
        } else {
          setError(error.response?.data?.error || 'Failed to load QR code');
        }
      }
    };

    fetchQR();

    // Poll for QR code updates
    const interval = setInterval(() => {
      if (status === 'waiting' || status === 'loading') {
        fetchQR();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      socketService.off('qr_code', handleQRCode);
      socketService.off('session_status', handleStatus);
      socketService.leaveSession(sessionId);
    };
  }, [sessionId, status, onReady]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Scan QR Code</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XCircle className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {status === 'loading' || status === 'waiting' ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <Loader2 className="w-12 h-12 animate-spin text-whatsapp mb-4" />
              <p className="text-gray-600">
                {status === 'waiting' ? 'Waiting for QR code...' : 'Loading QR code...'}
              </p>
            </motion.div>
          ) : status === 'ready' ? (
            <motion.div
              key="ready"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
              >
                <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
              </motion.div>
            <p className="text-lg font-semibold text-gray-900 mb-2">
              Connected Successfully!
            </p>
            <p className="text-gray-600 text-center">
              Your WhatsApp session is now active and ready to use.
            </p>
            <button
              onClick={onClose}
              className="mt-6 btn btn-primary"
            >
              Close
            </button>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <XCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setStatus('loading');
              }}
              className="btn btn-secondary flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            </motion.div>
          ) : (
            <motion.div
              key="qr"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-gray-50 rounded-xl p-6 flex items-center justify-center"
              >
                {qrCode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <QRCodeSVG
                      value={qrCode}
                      size={256}
                      level="H"
                      includeMargin={true}
                      className="w-full max-w-xs"
                    />
                  </motion.div>
                )}
              </motion.div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">
                    How to connect:
                  </p>
                  <ol className="text-sm text-blue-800 mt-2 space-y-1 list-decimal list-inside">
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap Menu (⋮) → Linked Devices</li>
                    <li>Tap "Link a Device"</li>
                    <li>Scan this QR code</li>
                  </ol>
                </div>
              </div>

              <p className="text-xs text-gray-500 text-center">
                QR code refreshes automatically every 20 seconds
              </p>
            </div>
            </motion.div>
          )}
        </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

