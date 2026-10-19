import http from 'node:http'
import { createApp } from './app.js'
import { attachSockets } from './socket.js'
import { migrate } from './migrate.js'
import { settleDue } from './bookings.js'

await migrate()
const server = http.createServer(createApp())
attachSockets(server)
setInterval(() => settleDue().catch(err => console.error('settle failed', err)), 60000)
const port = Number(process.env.PORT) || 4000
server.listen(port, () => console.log(`api listening on ${port}`))
