const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = path.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || process.env.PORT || 3000);
const host = process.argv[4] || "127.0.0.1";
const themeLabStatePath = path.join(root, ".theme-lab-state.json");
const themeLabStateRoute = "/__theme-lab-state";
const themeLabCodePath = path.join(root, "wp-content", "themes", "startdigital", "static", "theme-lab-generated-state.js");
const maxThemeLabBodyBytes = 25 * 1024 * 1024;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8"
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendJson(res, statusCode, payload, headers = {}) {
  send(
    res,
    statusCode,
    JSON.stringify(payload, null, 2),
    {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  );
}

function getPathname(requestUrl) {
  return decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
}

function resolvePath(pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(root, target));
  if (!filePath.startsWith(root)) {
    return null;
  }
  return filePath;
}

function normalizeThemeLabState(rawState) {
  const baseState = rawState && typeof rawState === "object" && !Array.isArray(rawState) ? rawState : {};
  return {
    ...baseState,
    version: 1,
    updatedAt: typeof baseState.updatedAt === "string" ? baseState.updatedAt : null
  };
}

function readThemeLabState() {
  return new Promise((resolve, reject) => {
    fs.readFile(themeLabStatePath, "utf8", (error, rawState) => {
      if (error) {
        if (error.code === "ENOENT") {
          resolve({ exists: false, state: normalizeThemeLabState({}) });
          return;
        }
        reject(error);
        return;
      }

      try {
        resolve({ exists: true, state: normalizeThemeLabState(JSON.parse(rawState)) });
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

function writeThemeLabState(nextState) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(normalizeThemeLabState(nextState), null, 2);
    fs.writeFile(themeLabStatePath, payload, "utf8", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function serializeThemeLabStateScript(nextState) {
  return `window.__maxFigmaLabCodeState = ${JSON.stringify(normalizeThemeLabState(nextState), null, 2)};\n`;
}

function writeThemeLabCodeState(nextState) {
  return new Promise((resolve, reject) => {
    const payload = serializeThemeLabStateScript(nextState);
    fs.writeFile(themeLabCodePath, payload, "utf8", (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function writeThemeLabArtifacts(nextState) {
  await Promise.all([
    writeThemeLabState(nextState),
    writeThemeLabCodeState(nextState)
  ]);
}

function mergeThemeLabState(currentState, incomingState) {
  const nextState = normalizeThemeLabState(currentState);
  const currentSavedAt = Number(nextState.__savedAt || 0) || 0;
  const incomingSavedAt = Number(incomingState?.__savedAt || 0) || 0;
  if (currentSavedAt && incomingSavedAt && incomingSavedAt < currentSavedAt) {
    return nextState;
  }
  Object.keys(incomingState).forEach((key) => {
    if (key === "version" || key === "updatedAt") {
      return;
    }
    nextState[key] = incomingState[key];
  });
  nextState.updatedAt = new Date().toISOString();
  return nextState;
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxThemeLabBodyBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

async function handleThemeLabState(req, res) {
  if (req.method === "GET") {
    try {
      const { exists, state } = await readThemeLabState();
      sendJson(res, 200, { ok: true, exists, state });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const rawBody = await collectRequestBody(req);
      const parsedBody = rawBody ? JSON.parse(rawBody) : {};
      if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
        sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
        return;
      }

      const { state: currentState } = await readThemeLabState();
      const nextState = mergeThemeLabState(currentState, parsedBody);
      await writeThemeLabArtifacts(nextState);
      sendJson(res, 200, { ok: true, savedAt: nextState.updatedAt, state: nextState });
    } catch (error) {
      const statusCode = error.message === "Request body too large" ? 413 : 500;
      sendJson(res, statusCode, { ok: false, error: error.message });
    }
    return;
  }

  sendJson(res, 405, { ok: false, error: `Method ${req.method} not allowed.` }, { Allow: "GET, POST" });
}

const server = http.createServer((req, res) => {
  const pathname = getPathname(req.url || "/");
  if (pathname === themeLabStateRoute) {
    void handleThemeLabState(req, res);
    return;
  }

  const filePath = resolvePath(pathname);
  if (!filePath) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    const finalPath = !statErr && stats.isDirectory() ? path.join(filePath, "index.html") : filePath;

    fs.readFile(finalPath, (readErr, data) => {
      if (readErr) {
        send(res, 404, "Not Found", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }

      const ext = path.extname(finalPath).toLowerCase();
      const noStore = (
        ext === ".html" ||
        finalPath === themeLabCodePath ||
        /theme-lab(?:-generated-state)?\.js$/i.test(finalPath)
      );
      send(res, 200, data, {
        "Cache-Control": noStore ? "no-store, no-cache, must-revalidate, max-age=0" : "no-cache",
        ...(noStore ? { Pragma: "no-cache", Expires: "0" } : {}),
        "Content-Type": mimeTypes[ext] || "application/octet-stream"
      });
    });
  });
});

readThemeLabState()
  .then(({ state }) => writeThemeLabCodeState(state))
  .catch(() => {});

server.listen(port, host, () => {
  console.log(`Static server running at http://${host}:${port}`);
});
