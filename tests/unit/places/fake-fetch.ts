/** A fetch double: answers from a queue and records every request. Never touches the network. */
export function fakeFetch(queue: Array<Response | Error>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("fakeFetch: unexpected request");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch: fn as typeof fetch, requests };
}

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const googleError = (status: number, code: string, message: string) =>
  jsonResponse(status, { error: { code: status, message, status: code } });
