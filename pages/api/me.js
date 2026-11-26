import { authEnabled } from "../../lib/auth";
import { getOwner } from "../../lib/owner";

/** Tells the UI whether GitHub sign-in is available and who is signed in. */
export default async function handler(req, res) {
  const owner = await getOwner(req, res);
  res.status(200).json({
    authEnabled,
    user: owner.user ? { name: owner.user.name, image: owner.user.image } : null,
  });
}
