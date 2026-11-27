import { reapDeadAlertFileLockUnderGuard } from '../services/system-alert-file-lock.mjs';

// Invoked by withAlertFileLock beneath the kernel-held reaper guard.
const [lockPath] = process.argv.slice(2);
if (!lockPath) throw new Error('Missing system alert lock path');
await reapDeadAlertFileLockUnderGuard(lockPath);
