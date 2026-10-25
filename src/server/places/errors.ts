/**
 * A failed Places API call. `describe()` gives only the HTTP status and Google's status code
 * ("404 NOT_FOUND"): the one form stored in review items or written to logs. Google's free-text
 * error message stays in `message`, for the operator's terminal only (pnpm seed:places).
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

  describe(): string {
    return `${this.httpStatus} ${this.googleStatus}`;
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
    if (typeof body.error?.status === "string" && /^[A-Z_]{1,64}$/.test(body.error.status)) {
      status = body.error.status;
    }
    if (typeof body.error?.message === "string") message = body.error.message;
  } catch {
    // not JSON: keep the HTTP status line
  }
  return new PlacesApiError(response.status, status, message.slice(0, MAX_MESSAGE));
}
