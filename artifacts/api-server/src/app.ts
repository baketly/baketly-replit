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
/**
 * Who may call this API from a browser.
 *
 * The web build serves the page and the API from one origin and needs none of
 * this. The phone app does: its pages come from capacitor://localhost, so
 * every request to the server is cross-origin, and without an allowance the
 * browser engine inside the app refuses them before they are sent.
 *
 * An allow-list rather than a wildcard, and only these two schemes, so this
 * cannot become "any website may drive a baker's account". Extra origins — a
 * staging build, a web deploy on its own domain — come from BAKETLY_ORIGINS.
 */
const NATIVE_ORIGINS = ["capacitor://localhost", "ionic://localhost"];
const allowedOrigins = new Set([
  ...NATIVE_ORIGINS,
  ...(process.env.BAKETLY_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  // the browser asks before sending the real request; answering it is free
  if (req.method === "OPTIONS") {
    res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
    return;
  }
  next();
});

app.use(cookieParser(process.env.SESSION_SECRET));
// The workspace is saved whole, and recipe photos make it far larger than
// express's 100 KB default.
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
