/**
 * A failed Places API call: the HTTP status and Google's status code only ("404 NOT_FOUND").
 * Google's free-text error message is never read or kept, so no error can carry Google text into
 * a review item, a log or a terminal (CLAUDE.md rule 2).
 */
export class PlacesApiError extends Error {
  constructor(
    public readonly httpStatus: number,
    public readonly googleStatus: string,
  ) {
    super(`Places API answered ${httpStatus} ${googleStatus}`);
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

/** Google APIs answer errors as `{ error: { code, message, status } }`; only `status` is read. */
export async function readGoogleError(response: Response): Promise<PlacesApiError> {
  let status = `HTTP_${response.status}`;
  try {
    const body = (await response.json()) as { error?: { status?: unknown } };
    if (typeof body.error?.status === "string" && /^[A-Z_]{1,64}$/.test(body.error.status)) {
      status = body.error.status;
    }
  } catch {
    // not JSON: keep the HTTP status
  }
  return new PlacesApiError(response.status, status);
}
