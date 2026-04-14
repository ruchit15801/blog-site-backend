import cron from 'node-cron';
import { runAutoBlogGeneration, getAutoBlogConfig } from '../services/auto-blog.service.js';

export async function runAutoBlogTick() {
  const config = await getAutoBlogConfig();
  if (!config.enabled) return { skipped: true, reason: 'disabled' };

  const now = new Date();
  if (now.getUTCHours() !== config.runAtHourUTC || now.getUTCMinutes() !== config.runAtMinuteUTC) {
    return { skipped: true, reason: 'outside_run_window' };
  }

  return runAutoBlogGeneration();
}

export function startAutoBlogCron() {
  const task = cron.schedule('*/1 * * * *', async () => {
    try {
      await runAutoBlogTick();
    } catch (err) {
      console.error('Auto blog cron error:', err);
    }
  }, { scheduled: true });

  return () => task.stop();
}
