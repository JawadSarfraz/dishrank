/**
 * A failed Places API call. Carries only the HTTP status, Google's status string and Google's error
 * message: never the API key, request headers or request body, so it is safe to log.
 */
export class PlacesApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly googleStatus: string,
    message: string,
  ) {
    super(message);
    this.name = "PlacesApiError";
  }

  /** "404 NOT_FOUND: …" — the only form in which Google errors are logged or stored. */
  describe(): string {
    return `${this.httpStatus} ${this.googleStatus}: ${this.message}`;
  }
}

/** The call budget (seed script --max-calls) would be exceeded by the next request; nothing was sent. */
export class PlacesBudgetError extends Error {
  constructor(public readonly calls: number) {
    super(`Places call budget reached after ${calls} calls`);
    this.name = "PlacesBudgetError";
  }
}

const MAX_MESSAGE = 300;

/** Google APIs answer errors as `{ error: { code, message, status } }`; anything else is summarised. */
export async function readGoogleError(response: Response): Promise<PlacesApiError> {
  let status = `HTTP_${response.status}`;
  let message = response.statusText || "request failed";
  try {
    const body = (await response.json()) as { error?: { status?: unknown; message?: unknown } };
    if (typeof body.error?.status === "string") status = body.error.status;
    if (typeof body.error?.message === "string") message = body.error.message;
  } catch {
    // not JSON: keep the HTTP status line
  }
  return new PlacesApiError(response.status, status, message.slice(0, MAX_MESSAGE));
}
