import { loadConfig } from './config/index';
import { buildApp } from './app';
import { startMaintenanceJobs } from './jobs/maintenance';
import { checkFfmpegAvailable } from './media/index';

/** Process entrypoint: load config, build the app, and start listening. */
async function main(): Promise<void> {
  const config = loadConfig();
  const { app, services } = await buildApp(config);

  // Optional dependency check: warn (don't fail) if ffmpeg is missing — video
  // posters will degrade to a generic icon while everything else still works.
  void checkFfmpegAvailable().then((ok) => {
    if (!ok) {
      app.log.warn(
        { event: 'startup.ffmpeg.missing' },
        'ffmpeg not found on PATH — video poster thumbnails will be unavailable',
      );
    }
  });

  // Scheduled housekeeping: session purge, temp sweep, trash retention (T069).
  const stopJobs = startMaintenanceJobs(services, app.log);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    stopJobs();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
