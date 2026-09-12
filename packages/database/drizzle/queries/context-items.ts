import { db } from "../client";

/** Only the authenticated owner's context belongs in their personal map. */
export async function getContextItemsByOwnerId(ownerId: string) {
	return db.query.contextItems.findMany({
		where: (items, { eq }) => eq(items.ownerId, ownerId),
		orderBy: (items, { desc }) => [desc(items.createdAt), desc(items.id)],
		limit: 200,
	});
}
