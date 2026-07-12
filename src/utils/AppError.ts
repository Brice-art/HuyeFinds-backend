// A deliberate, typed error you throw on purpose (bad input, not found,
// unauthorized) — distinct from an unexpected crash. The error middleware
// uses `isOperational` to decide whether to leak the message to the client
// or hide it behind a generic 500.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational = true;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
