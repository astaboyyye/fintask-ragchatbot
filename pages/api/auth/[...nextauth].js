import NextAuth from "next-auth";
import { authEnabled, authOptions } from "../../../lib/auth";

const nextAuthHandler = NextAuth(authOptions);

// Optional GitHub sign-in (see lib/auth.js). When it isn't configured the
// endpoints answer 404 instead of erroring about a missing secret.
export default function handler(req, res) {
  if (!authEnabled) return res.status(404).json({ error: "Sign-in is not configured." });
  return nextAuthHandler(req, res);
}
