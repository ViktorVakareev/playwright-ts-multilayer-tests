import { resetDatabase } from '../scripts/reset-db.js';
import { settings } from '../src/settings.js';

/** Every run starts from the same seed data, so results don't depend on earlier runs. */
export default async function globalSetup(): Promise<void> {
  await resetDatabase(settings.databaseUrl);
}
