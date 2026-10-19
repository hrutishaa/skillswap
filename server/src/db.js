import pg from 'pg'

pg.types.setTypeParser(20, Number)

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://skillswap:skillswap@localhost:5432/skillswap',
  max: 20,
})

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
