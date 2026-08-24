import { Readable } from 'stream';
import {
  raw,
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import {
  InvalidImageObjectError,
  InvalidImageUploadError,
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const PHOTO_UPLOAD_PATH = /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const uploadRequestWindows = new Map<
  string,
  { count: number; active: number; resetsAt: number }
>();
let activeUploads = 0;

function reserveUploadSlot(req: Request): boolean {
  const now = Date.now();
  const clientId = req.ip || 'unknown';
  const existing = uploadRequestWindows.get(clientId);
  if (!existing || existing.resetsAt <= now) {
    uploadRequestWindows.set(clientId, {
      count: 1,
      active: 1,
      resetsAt: now + 10 * 60_000,
    });
    activeUploads += 1;
    return true;
  }
  existing.count += 1;
  if (existing.count > 12 || existing.active >= 2 || activeUploads >= 8) {
    return false;
  }
  existing.active += 1;
  activeUploads += 1;
  return true;
}

function releaseUploadSlot(req: Request): void {
  const existing = uploadRequestWindows.get(req.ip || 'unknown');
  if (existing?.active) {
    existing.active -= 1;
    activeUploads = Math.max(0, activeUploads - 1);
  }
}

function admitPhotoUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const contentType = req.get('content-type')?.toLowerCase() || '';
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    res.status(400).json({ error: 'Choose a JPEG, PNG, WebP, or GIF image.' });
    return;
  }
  const contentLength = Number(req.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: 'Choose an image smaller than 10 MB.' });
    return;
  }
  if (!reserveUploadSlot(req)) {
    res.status(429).json({ error: 'Too many photo uploads. Please try again shortly.' });
    return;
  }
  let released = false;
  const uploadDeadline = setTimeout(() => {
    req.destroy(new Error('Photo upload timed out'));
  }, 30_000);
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    clearTimeout(uploadDeadline);
    releaseUploadSlot(req);
  };
  res.once('finish', release);
  res.once('close', release);
  req.once('aborted', release);
  next();
}

/**
 * POST /storage/uploads
 *
 * Receive and validate an image before writing it to object storage. This keeps
 * the temporary anonymous single-user flow bounded: no client receives a URL
 * capable of writing arbitrary bytes directly to the bucket.
 */
router.post(
  '/storage/uploads',
  admitPhotoUpload,
  raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    limit: '10mb',
  }),
  async (req: Request, res: Response) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'Choose a JPEG, PNG, WebP, or GIF image.' });
        return;
      }
      const objectPath = await objectStorageService.saveVerifiedImage(
        req.body,
        req.get('content-type') || '',
      );
      res.status(201).json({ objectPath });
    } catch (error) {
      if (error instanceof InvalidImageUploadError) {
        res.status(400).json({ error: error.message });
        return;
      }
      req.log.error({ err: error }, 'Error saving image upload');
      res.status(500).json({ error: 'Failed to upload image' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    if (!PHOTO_UPLOAD_PATH.test(wildcardPath)) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    // This object path is intentionally public while the app is single-user.
    // Add authentication and object ACL checks here when customer accounts
    // are introduced.

    const verifiedContentType =
      await objectStorageService.getVerifiedImageContentType(objectFile);
    const response = await objectStorageService.downloadObject(
      objectFile,
      3600,
      verifiedContentType,
    );

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    if (error instanceof InvalidImageObjectError) {
      req.log.warn({ err: error }, 'Blocked unsupported image object');
      res.status(415).json({ error: 'Unsupported image object' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
