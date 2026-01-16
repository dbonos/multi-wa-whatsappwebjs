const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class HealthMonitor {
    constructor() {
        this.memoryThreshold = 0.85; // 85% memory usage threshold
        this.checkInterval = 60000; // Check every 60 seconds
        this.cleanupInterval = 300000; // Cleanup every 5 minutes
        this.monitoringActive = false;
        this.stats = {
            lastCheck: null,
            memoryUsage: 0,
            chromeProcesses: 0,
            zombieProcesses: 0,
            cleanupCount: 0,
            restartCount: 0
        };
    }

    start() {
        if (this.monitoringActive) {
            console.log('⚠️ [HEALTH MONITOR] Already running');
            return;
        }

        this.monitoringActive = true;
        console.log('🏥 [HEALTH MONITOR] Starting health monitoring...');
        console.log(`🏥 [HEALTH MONITOR] Memory threshold: ${this.memoryThreshold * 100}%`);
        console.log(`🏥 [HEALTH MONITOR] Check interval: ${this.checkInterval / 1000}s`);
        console.log(`🏥 [HEALTH MONITOR] Cleanup interval: ${this.cleanupInterval / 1000}s`);

        // Start memory monitoring
        this.memoryCheckTimer = setInterval(() => {
            this.checkMemory();
        }, this.checkInterval);

        // Start zombie process cleanup
        this.cleanupTimer = setInterval(() => {
            this.cleanupZombieProcesses();
        }, this.cleanupInterval);

        // Run initial check
        this.checkMemory();
        this.cleanupZombieProcesses();
    }

    stop() {
        if (!this.monitoringActive) {
            return;
        }

        console.log('🏥 [HEALTH MONITOR] Stopping health monitoring...');
        this.monitoringActive = false;

        if (this.memoryCheckTimer) {
            clearInterval(this.memoryCheckTimer);
            this.memoryCheckTimer = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    async checkMemory() {
        try {
            const memInfo = await this.getMemoryInfo();
            const chromeCount = await this.getChromeProcessCount();

            this.stats.lastCheck = new Date();
            this.stats.memoryUsage = memInfo.usedPercent;
            this.stats.chromeProcesses = chromeCount;

            console.log(`🏥 [HEALTH MONITOR] Memory: ${memInfo.usedPercent.toFixed(1)}% (${memInfo.used}/${memInfo.total}), Chrome processes: ${chromeCount}`);

            // Alert if memory usage is high
            if (memInfo.usedPercent >= this.memoryThreshold) {
                console.error(`🚨 [HEALTH MONITOR] HIGH MEMORY USAGE: ${memInfo.usedPercent.toFixed(1)}% (threshold: ${this.memoryThreshold * 100}%)`);
                console.error(`🚨 [HEALTH MONITOR] Chrome processes: ${chromeCount}`);
                
                // Trigger cleanup
                await this.cleanupZombieProcesses();
                
                // If still high after cleanup, log warning
                const newMemInfo = await this.getMemoryInfo();
                if (newMemInfo.usedPercent >= this.memoryThreshold) {
                    console.error(`🚨 [HEALTH MONITOR] Memory still high after cleanup: ${newMemInfo.usedPercent.toFixed(1)}%`);
                    console.error(`🚨 [HEALTH MONITOR] Consider restarting service or increasing server memory`);
                }
            }

            // Alert if too many Chrome processes
            if (chromeCount > 20) {
                console.warn(`⚠️ [HEALTH MONITOR] Too many Chrome processes: ${chromeCount} (expected: 6-14 for 2 sessions)`);
                await this.cleanupZombieProcesses();
            }

        } catch (error) {
            console.error('❌ [HEALTH MONITOR] Error checking memory:', error.message);
        }
    }

    async getMemoryInfo() {
        try {
            const { stdout } = await execPromise("free -b | grep Mem | awk '{print $2,$3}'");
            const [total, used] = stdout.trim().split(' ').map(Number);
            const usedPercent = (used / total) * 100;

            return {
                total: this.formatBytes(total),
                used: this.formatBytes(used),
                usedPercent
            };
        } catch (error) {
            console.error('❌ [HEALTH MONITOR] Error getting memory info:', error.message);
            return { total: '0', used: '0', usedPercent: 0 };
        }
    }

    async getChromeProcessCount() {
        try {
            const { stdout } = await execPromise("ps aux | grep chrome | grep -v grep | wc -l");
            return parseInt(stdout.trim()) || 0;
        } catch (error) {
            console.error('❌ [HEALTH MONITOR] Error counting Chrome processes:', error.message);
            return 0;
        }
    }

    async cleanupZombieProcesses() {
        try {
            console.log('🧹 [HEALTH MONITOR] Starting zombie process cleanup...');

            // Find Chrome processes that are not associated with active sessions
            // This is safe because we use specific user-data-dir for each session
            const { stdout: psOutput } = await execPromise(
                "ps aux | grep chrome | grep -v grep | grep -v chrome_crashpad_handler | awk '{print $2,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20}'"
            );

            const lines = psOutput.trim().split('\n').filter(line => line);
            let zombieCount = 0;

            for (const line of lines) {
                const parts = line.split(' ');
                const pid = parts[0];
                const cmdline = parts.slice(1).join(' ');

                // Check if this is a Chrome process with user-data-dir
                if (cmdline.includes('user-data-dir')) {
                    // Extract session ID from user-data-dir
                    const match = cmdline.match(/session-(\d+)/);
                    if (match) {
                        const sessionId = match[1];
                        
                        // Check if this session still exists in our clients Map
                        // We'll pass this check to the caller (server.js will provide clients Map)
                        // For now, just log suspicious processes
                        
                        // Check process age (if running for more than 2 hours, might be zombie)
                        const { stdout: etime } = await execPromise(`ps -p ${pid} -o etime= 2>/dev/null || echo ""`);
                        const etimeStr = etime.trim();
                        
                        if (etimeStr) {
                            // Parse etime (format: [[dd-]hh:]mm:ss)
                            const isOld = this.isProcessOld(etimeStr);
                            
                            if (isOld) {
                                console.log(`🔍 [HEALTH MONITOR] Found old Chrome process: PID ${pid}, session ${sessionId}, age ${etimeStr}`);
                                // Don't auto-kill here, just log for now
                                // Actual cleanup will be done by checking against active clients
                            }
                        }
                    }
                }
            }

            // Clean up crashpad handlers that have no parent
            const { stdout: orphanedCrashpad } = await execPromise(
                "ps aux | grep chrome_crashpad_handler | grep -v grep | awk '{print $2}' | while read pid; do ppid=$(ps -p $pid -o ppid= 2>/dev/null | tr -d ' '); if [ -z \"$ppid\" ] || ! ps -p $ppid > /dev/null 2>&1; then echo $pid; fi; done"
            ).catch(() => ({ stdout: '' }));

            const orphanedPids = orphanedCrashpad.trim().split('\n').filter(pid => pid);
            
            for (const pid of orphanedPids) {
                try {
                    console.log(`🧹 [HEALTH MONITOR] Killing orphaned crashpad handler: PID ${pid}`);
                    await execPromise(`kill -9 ${pid}`);
                    zombieCount++;
                } catch (error) {
                    console.error(`❌ [HEALTH MONITOR] Error killing PID ${pid}:`, error.message);
                }
            }

            this.stats.zombieProcesses = zombieCount;
            this.stats.cleanupCount++;

            if (zombieCount > 0) {
                console.log(`✅ [HEALTH MONITOR] Cleaned up ${zombieCount} zombie processes`);
            } else {
                console.log(`✅ [HEALTH MONITOR] No zombie processes found`);
            }

        } catch (error) {
            console.error('❌ [HEALTH MONITOR] Error during cleanup:', error.message);
        }
    }

    isProcessOld(etimeStr) {
        // Parse etime format: [[dd-]hh:]mm:ss
        // Consider "old" if running for more than 2 hours
        const parts = etimeStr.split(':');
        
        if (parts.length === 3) {
            // Format: hh:mm:ss or dd-hh:mm:ss
            const first = parts[0];
            if (first.includes('-')) {
                // dd-hh format
                return true; // Any process running for days is old
            } else {
                const hours = parseInt(first);
                return hours >= 2;
            }
        } else if (parts.length === 2) {
            // Format: mm:ss (less than 1 hour)
            return false;
        }
        
        return false;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    getStats() {
        return {
            ...this.stats,
            isActive: this.monitoringActive,
            memoryThreshold: `${this.memoryThreshold * 100}%`,
            checkInterval: `${this.checkInterval / 1000}s`,
            cleanupInterval: `${this.cleanupInterval / 1000}s`
        };
    }

    // Method to cleanup specific session's Chrome processes
    async cleanupSessionProcesses(sessionId, clients) {
        try {
            console.log(`🧹 [HEALTH MONITOR] Cleaning up Chrome processes for session: ${sessionId}`);

            // Check if session still has active client
            const hasActiveClient = clients && clients.has(sessionId);

            if (hasActiveClient) {
                console.log(`ℹ️ [HEALTH MONITOR] Session ${sessionId} has active client, skipping cleanup`);
                return 0;
            }

            // Find Chrome processes for this session
            const { stdout } = await execPromise(
                `ps aux | grep "session-${sessionId}" | grep chrome | grep -v grep | awk '{print $2}'`
            );

            const pids = stdout.trim().split('\n').filter(pid => pid);
            let killedCount = 0;

            for (const pid of pids) {
                try {
                    console.log(`🧹 [HEALTH MONITOR] Killing Chrome process for session ${sessionId}: PID ${pid}`);
                    await execPromise(`kill -9 ${pid}`);
                    killedCount++;
                } catch (error) {
                    console.error(`❌ [HEALTH MONITOR] Error killing PID ${pid}:`, error.message);
                }
            }

            if (killedCount > 0) {
                console.log(`✅ [HEALTH MONITOR] Killed ${killedCount} Chrome processes for session ${sessionId}`);
            }

            return killedCount;

        } catch (error) {
            console.error(`❌ [HEALTH MONITOR] Error cleaning up session ${sessionId}:`, error.message);
            return 0;
        }
    }
}

// Export singleton instance
module.exports = new HealthMonitor();
