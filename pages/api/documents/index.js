import { prisma } from "../../../lib/db";
import { getOwner } from "../../../lib/owner";
import { allowMethods, publicDocumentSelect, withIndexState } from "../../../lib/api";
import { EMBEDDING_MODEL } from "../../../lib/embedder";

/** GET: the current visitor's documents, newest first. */
export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  const owner = await getOwner(req, res);
  const documents = await prisma.document.findMany({
    where: { ownerId: owner.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: publicDocumentSelect,
  });
  res.status(200).json({ documents: documents.map((d) => withIndexState(d, EMBEDDING_MODEL)) });
}
