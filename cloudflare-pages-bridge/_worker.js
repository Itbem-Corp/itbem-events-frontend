const UPSTREAM_ORIGIN = "https://eventiapp-public.andresbme.workers.dev";

function forwardedRequest(request) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, UPSTREAM_ORIGIN);
  const headers = new Headers(request.headers);

  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.slice(0, -1));

  return new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}

async function publicResponse(response, request) {
  const headers = new Headers(response.headers);
  const publicOrigin = new URL(request.url).origin;
  const contentType = headers.get("content-type") || "";
  let body = response.body;

  if (contentType.toLowerCase().includes("text/html")) {
    body = (await response.text()).replaceAll(UPSTREAM_ORIGIN, publicOrigin);
    headers.delete("content-length");
    headers.delete("content-encoding");
  }

  const location = headers.get("location");

  if (location) {
    const upstreamUrl = new URL(UPSTREAM_ORIGIN);
    const resolvedLocation = new URL(location, upstreamUrl);

    if (resolvedLocation.origin === upstreamUrl.origin) {
      const publicUrl = new URL(request.url);
      publicUrl.pathname = resolvedLocation.pathname;
      publicUrl.search = resolvedLocation.search;
      publicUrl.hash = resolvedLocation.hash;
      headers.set("location", publicUrl.toString());
    }
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const response = await fetch(forwardedRequest(request));
    return await publicResponse(response, request);
  },
};
