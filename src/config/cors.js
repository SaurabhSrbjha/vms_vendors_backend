/**
 * CORS Configuration
 * Configured to support Web, Mobile (React Native), DevTools, and local emulators.
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

export const corsOptions = {
  // Allow all origins dynamically with credentials support
  origin: (origin, callback) => {
    callback(null, origin || "*");
  },
  credentials: true,
  methods: allowedMethods,
  allowedHeaders: allowedHeaders,
  // 200 status code for preflight compatibility with legacy clients and older WebViews
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

export default corsOptions;
