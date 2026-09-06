import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
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

function postgresConnectionString(user: string, password: string): string {
  const url = new URL('postgresql://placeholder');
  url.hostname = host;
  url.port = String(port);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  // Make the current node-postgres TLS behavior explicit instead of relying on
  // the deprecated sslmode=require alias semantics.
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
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

async function bootstrapLangGraphCheckpointSchema() {
  console.log('Bootstrapping LangGraph checkpoint schema with privileged migration identity');
  const checkpointer = PostgresSaver.fromConnString(
    postgresConnectionString(adminUser, adminPassword),
    { schema: 'langgraph' }
  );
  try {
    await checkpointer.setup();
  } finally {
    await checkpointer.end();
  }

  // Runtime workloads receive data-plane access only. DDL remains a deployment
  // responsibility so application startup never requires CREATE on the database.
  console.log('Applying least-privilege runtime grants to LangGraph checkpoint objects');
  await client.query(`
    grant usage on schema langgraph to bcsone_runtime;
    grant select, insert, update, delete on all tables in schema langgraph to bcsone_runtime;
    grant usage, select, update on all sequences in schema langgraph to bcsone_runtime;
    revoke create on schema langgraph from bcsone_runtime;
  `);

  const readiness = await client.query<{
    checkpoint_migrations: string | null;
    checkpoints: string | null;
    checkpoint_blobs: string | null;
    checkpoint_writes: string | null;
  }>(`
    select
      to_regclass('langgraph.checkpoint_migrations')::text as checkpoint_migrations,
      to_regclass('langgraph.checkpoints')::text as checkpoints,
      to_regclass('langgraph.checkpoint_blobs')::text as checkpoint_blobs,
      to_regclass('langgraph.checkpoint_writes')::text as checkpoint_writes
  `);
  const row = readiness.rows[0];
  if (!row || Object.values(row).some(value => !value)) {
    throw new Error(`LangGraph checkpoint bootstrap incomplete: ${JSON.stringify(row ?? {})}`);
  }
  console.log('LangGraph checkpoint schema is ready');
}

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

    await bootstrapLangGraphCheckpointSchema();

    const result = await client.query(`select version, applied_at from bcs_state.schema_migrations order by applied_at, version`);
    console.log(JSON.stringify({ status: 'ok', migrations: result.rows, langGraphCheckpointSchema: 'ready' }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('BCS ONE database migration failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
