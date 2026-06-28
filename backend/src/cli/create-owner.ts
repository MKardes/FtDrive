import { loadConfig } from '../config/index';
import { createServices } from '../services';

/**
 * One-time owner bootstrap CLI (T021). There is NO public signup — the first
 * owner is provisioned here. Usage:
 *
 *   npm run create-owner -- --username owner --password '<secret>'
 *
 * Password may instead come from OWNER_BOOTSTRAP_PASSWORD (and username from
 * OWNER_BOOTSTRAP_USERNAME) so it never appears in shell history.
 */
function parseArgs(argv: string[]): { username?: string; password?: string } {
  const out: { username?: string; password?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--username') out.username = argv[++i];
    else if (arg === '--password') out.password = argv[++i];
    else if (arg?.startsWith('--username=')) out.username = arg.slice('--username='.length);
    else if (arg?.startsWith('--password=')) out.password = arg.slice('--password='.length);
  }
  return out;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const args = parseArgs(process.argv.slice(2));
  const username = args.username ?? config.ownerBootstrap.username;
  const password = args.password ?? config.ownerBootstrap.password;

  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: create-owner --username <name> --password <secret>\n' +
        '(or set OWNER_BOOTSTRAP_USERNAME / OWNER_BOOTSTRAP_PASSWORD)',
    );
    process.exit(2);
  }

  const services = createServices(config);
  try {
    if (services.users.ownerExists()) {
      // eslint-disable-next-line no-console
      console.error('An owner account already exists. Refusing to create another via bootstrap.');
      process.exit(1);
    }
    const user = await services.users.createUser({ username, password, role: 'owner' });
    // eslint-disable-next-line no-console
    console.log(`Created owner "${user.username}" (id ${user.id}).`);
  } finally {
    services.dbHandle.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
