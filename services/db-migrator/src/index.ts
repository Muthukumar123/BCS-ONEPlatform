import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const host = required('POSTGRES_HOST');
const adminPassword = required('POSTGRES_ADMIN_PASSWORD');
const runtimePassword = required('POSTGRES_RUNTIME_PASSWORD');
const database = process.env.POSTGRES_DATABASE ?? 'bcsone';
const adminUser = process.env.POSTGRES_ADMIN_USER ?? 'bcsoneadmin';
const runtimeUser = process.env.POSTGRES_RUNTIME_USER ?? 'bcsone_runtime';
const port = Number(process.env.POSTGRES_PORT ?? 5432);

if (runtimeUser !== 'bcsone_runtime') {
  throw new Error('This migration currently requires POSTGRES_RUNTIME_USER=bcsone_runtime so grants remain deterministic.');
}

const client = new Client({
  host,
  port,
  database,
  user: adminUser,
  password: adminPassword,
  ssl: { rejectUnauthorized: true },
  application_name: 'bcs-one-db-migrator',
  connectionTimeoutMillis: 10_000
});

async function main() {
  console.log(`Connecting to PostgreSQL ${host}:${port}/${database} as ${adminUser}`);
  await client.connect();
  try {
    console.log('Ensuring restricted BCS ONE runtime role exists');
    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'bcsone_runtime') then
          create role bcsone_runtime login nosuperuser nocreatedb nocreaterole noinherit;
        end if;
      end $$;
    `);

    // PostgreSQL cannot infer the type of a bind parameter used only as a
    // variadic format() argument. Cast it explicitly before %L quotes it.
    // The password remains a bound value and is never interpolated in Node.
    console.log('Rotating BCS ONE runtime database credential');
    const passwordDdl = await client.query<{ ddl: string }>(
      `select format('alter role bcsone_runtime password %L', $1::text) as ddl`,
      [runtimePassword]
    );
    const ddl = passwordDdl.rows[0]?.ddl;
    if (!ddl) throw new Error('Failed to construct runtime role credential rotation statement');
    await client.query(ddl);

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(__dirname, '../migrations');
    const migrationFiles = (await readdir(migrationsDir))
      .filter(name => /^\d+_.+\.sql$/.test(name))
      .sort((a, b) => a.localeCompare(b));

    if (migrationFiles.length === 0) throw new Error('No database migrations found');
    for (const migrationFile of migrationFiles) {
      const migrationSql = await readFile(path.join(migrationsDir, migrationFile), 'utf8');
      console.log(`Applying ${migrationFile}`);
      await client.query(migrationSql);
    }

    const result = await client.query(`select version, applied_at from bcs_state.schema_migrations order by applied_at, version`);
    console.log(JSON.stringify({ status: 'ok', migrations: result.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('BCS ONE database migration failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
