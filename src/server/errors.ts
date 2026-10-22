/** Error thrown by services; actions and route handlers map it to `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}
