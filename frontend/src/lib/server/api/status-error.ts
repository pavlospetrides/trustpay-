/** An error that carries its HTTP status, so the handler need not guess it from the message. */
export class StatusError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
