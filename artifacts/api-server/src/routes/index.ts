import { Router, type IRouter } from "express";
import healthRouter from "./health";
import askRouter from "./ask";
import authRouter from "./auth";
import ingredientLabelRouter from "./ingredient-label";
import marketCheckRouter from "./market-check";
import placesRouter from "./places";
import privacyRouter from "./privacy";
import remindersRouter from "./reminders";
import workspaceStateRouter from "./workspace-state";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(askRouter);
router.use(ingredientLabelRouter);
router.use(marketCheckRouter);
router.use(placesRouter);
router.use(privacyRouter);
router.use(remindersRouter);
router.use(workspaceStateRouter);

export default router;
