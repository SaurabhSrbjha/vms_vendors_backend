/**
 * CORS Configuration and Middleware
 * Supports Web, React Native, DevTools, Emulators, and Native Mobile requests.
 */

export const allowedHeaders = [
  "Authorization",
  "Content-Type",
  "Accept",
  "Origin",
  "X-Requested-With",
  "x-device-type",
  "x-device-name",
  "x-device-id",
  "x-app-version",
];

export const allowedMethods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
];

/**
 * Custom CORS middleware that guarantees:
 * 1. Dynamic origin reflection with credentials (or '*' when no origin is provided).
 * 2. Mirrors requested headers directly or supplies the full allowed headers list.
 * 3. Immediately handles all OPTIONS preflights with status 200.
 */
export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", allowedMethods.join(", "));

  const requestedHeaders = req.headers["access-control-request-headers"];
  if (requestedHeaders) {
    res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
  } else {
    res.setHeader("Access-Control-Allow-Headers", allowedHeaders.join(", "));
  }

  res.setHeader("Access-Control-Expose-Headers", "*");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
};

export default corsMiddleware;
