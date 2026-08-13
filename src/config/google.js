import { OAuth2Client } from "google-auth-library";
import { env } from "./env.js";

/**
 * We only ever verify ID tokens here — never run the redirect/consent-screen
 * dance server-side. Native clients (iOS/Android) and the web frontend get
 * an ID token directly from Google's own SDK and hand it to us; the backend
 * just confirms Google signed it and reads the identity out. That keeps
 * client secrets and redirect URIs entirely out of this service.
 */
export const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
