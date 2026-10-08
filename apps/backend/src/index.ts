import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { HttpError } from './http'
import { availabilityRoutes } from './routes/availability'
import { guestRoutes } from './routes/guests'
import { paymentRoutes } from './routes/payments'
import { reservationRoutes } from './routes/reservations'
import { roomTypeRoutes } from './routes/room-types'
import { roomClosureRoutes } from './routes/room-closures'
import { roomRoutes } from './routes/rooms'

const app = new Hono<Env>()

app.use(
  '*',
  cors({
    origin: (origin) =>
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      /^https:\/\/(?:[a-z0-9-]+-)?pms-portal\.meldar\.workers\.dev$/.test(origin)
        ? origin
        : null,
  }),
)

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'internal error' }, 500)
})

app.notFound((c) => c.json({ error: 'not found' }, 404))

app.get('/', (c) => c.json({ name: 'pms' }))
app.route('/room-types', roomTypeRoutes)
app.route('/rooms', roomRoutes)
app.route('/room-closures', roomClosureRoutes)
app.route('/availability', availabilityRoutes)
app.route('/guests', guestRoutes)
app.route('/reservations', reservationRoutes)
app.route('/payments', paymentRoutes)

export default app
