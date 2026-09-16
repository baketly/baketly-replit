import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cookieParser(process.env.SESSION_SECRET));
// The workspace is saved whole, and recipe photos make it far larger than
// express's 100 KB default.
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
