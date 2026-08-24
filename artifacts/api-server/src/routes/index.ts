import { Router, type IRouter } from "express";
import healthRouter from "./health";
import askRouter from "./ask";
import ingredientLabelRouter from "./ingredient-label";
import workspaceStateRouter from "./workspace-state";

const router: IRouter = Router();

router.use(healthRouter);
router.use(askRouter);
router.use(ingredientLabelRouter);
router.use(workspaceStateRouter);

export default router;
