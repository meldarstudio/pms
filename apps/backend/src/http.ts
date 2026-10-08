import { zValidator } from '@hono/zod-validator'
import type { Context } from 'hono'
import type { z } from 'zod'
import type { Env } from './env'

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message)
  }
}

export function validate<T extends z.ZodType>(target: 'json' | 'query', schema: T) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? 'invalid request' }, 400)
    }
  })
}

export function currency(c: Context<Env>): string {
  return c.env.CURRENCY || 'USD'
}

function errorText(err: unknown): string {
  if (!err) return ''
  if (err instanceof Error) return `${err.message} ${errorText(err.cause)}`
  return String(err)
}

export function rethrowConflict(err: unknown): never {
  const text = errorText(err)
  if (text.includes('no availability')) throw new HttpError(409, 'no availability')
  if (text.includes('room taken')) throw new HttpError(409, 'room is already assigned for those dates')
  if (text.includes('room closed')) throw new HttpError(409, 'room is closed for those dates')
  if (text.includes('closure overlaps stay')) throw new HttpError(409, 'room has a stay on those dates')
  if (text.includes('closure overlaps closure')) throw new HttpError(409, 'room is already closed on those dates')
  if (text.includes('rooms.number')) throw new HttpError(409, 'room number already exists')
  if (text.includes('room_types.name')) throw new HttpError(409, 'room type already exists')
  throw err
}
