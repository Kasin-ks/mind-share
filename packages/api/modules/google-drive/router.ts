import { getConnectionStatus } from "./procedures/get-connection-status";
import { getFile } from "./procedures/get-file";
import { listFiles } from "./procedures/list-files";

export const googleDriveRouter = {
	getConnectionStatus,
	listFiles,
	getFile,
};
