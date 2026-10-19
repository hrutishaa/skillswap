import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export async function migrate({ reset = false } = {}) {
  if (reset) await pool.query('drop schema public cascade; create schema public;')
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())')
  const done = new Set((await pool.query('select name from schema_migrations')).rows.map(r => r.name))
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'))
      await client.query('insert into schema_migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log('applied', file)
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  await pool.query(`insert into accounts (kind) values ('escrow'), ('mint') on conflict do nothing`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate({ reset: process.argv.includes('--reset') }).then(() => pool.end())
}
