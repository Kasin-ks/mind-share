import { getContextGraph } from "./procedures/get-context-graph";
import { listAuditLog } from "./procedures/list-audit-log";
import { listContextItems } from "./procedures/list-context-items";
import { negotiateContext } from "./procedures/negotiate-context";
import { syncGoogleDrive } from "./procedures/sync-google-drive";
import { uploadDocuments } from "./procedures/upload-documents";

export const mindShareRouter = {
	negotiateContext,
	listContextItems,
	listAuditLog,
	getContextGraph,
	syncGoogleDrive,
	uploadDocuments,
};
