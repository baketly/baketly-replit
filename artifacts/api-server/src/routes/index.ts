import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingredientLabelRouter from "./ingredient-label";
import workspaceStateRouter from "./workspace-state";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ingredientLabelRouter);
router.use(workspaceStateRouter);

export default router;
