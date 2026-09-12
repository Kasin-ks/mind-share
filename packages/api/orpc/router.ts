import type { RouterClient } from "@orpc/server";
import { adminRouter } from "../modules/admin/router";
import { aiRouter } from "../modules/ai/router";
import { contactRouter } from "../modules/contact/router";
import { googleDriveRouter } from "../modules/google-drive/router";
import { mastraRouter } from "../modules/mastra/router";
import { mindShareRouter } from "../modules/mind-share/router";
import { newsletterRouter } from "../modules/newsletter/router";
import { organizationsRouter } from "../modules/organizations/router";
import { paymentsRouter } from "../modules/payments/router";
import { tasksRouter } from "../modules/tasks/router";
import { usersRouter } from "../modules/users/router";
import { publicProcedure } from "./procedures";

export const router = publicProcedure.router({
	admin: adminRouter,
	newsletter: newsletterRouter,
	contact: contactRouter,
	organizations: organizationsRouter,
	users: usersRouter,
	payments: paymentsRouter,
	ai: aiRouter,
	mastra: mastraRouter,
	googleDrive: googleDriveRouter,
	tasks: tasksRouter,
	mindShare: mindShareRouter,
});

export type ApiRouterClient = RouterClient<typeof router>;
