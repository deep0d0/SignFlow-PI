/**
 * App Handlers - reserved for future application-level IPC methods.
 */

export const appHandlers = {
  getInfo: async () => ({
    name: "SignFlow",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "production",
  }),
};
