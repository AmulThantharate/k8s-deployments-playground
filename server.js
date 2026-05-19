const express = require("express");
const Redis = require("ioredis");

const PORT = process.env.PORT || 3000;
const COLOR = process.env.DEPLOY_COLOR || "unknown";
const VERSION = process.env.APP_VERSION || "0.0.0";
const REDIS_HOST = process.env.REDIS_HOST || "redis-service";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const METRICS_ENABLED = process.env.METRICS_ENABLED === "true";

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on("error", (err) => console.error("Redis Error:", err));
redis.on("connect", () => console.log("Redis connected successfully"));
redis.on("ready", () => console.log("Redis ready for commands"));

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use((req, res, next) => {
  const start = Date.now();

  res.set("X-Deploy-Color", COLOR);
  res.set("X-App-Version", VERSION);
  res.set("X-Pod-Name", process.env.HOSTNAME || "unknown");

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${COLOR}/${VERSION}`,
    );
  });

  next();
});

app.get("/health", async (req, res) => {
  try {
    await redis.ping();
    res.status(200).json({
      status: "healthy",
      color: COLOR,
      version: VERSION,
      pod: process.env.HOSTNAME || "unknown",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({
      status: "unhealthy",
      color: COLOR,
      version: VERSION,
      error: "Redis connection failed",
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/live", (req, res) => {
  res.status(200).json({
    status: "alive",
    color: COLOR,
    version: VERSION,
  });
});

app.get("/ready", async (req, res) => {
  try {
    await redis.ping();
    res.status(200).json({
      status: "ready",
      color: COLOR,
      version: VERSION,
    });
  } catch (e) {
    res.status(503).json({
      status: "not ready",
      color: COLOR,
      version: VERSION,
    });
  }
});

const COUNTER_KEY = "visit_counter";
const TOTAL_KEY = "total_visits";

app.get("/counter", async (req, res) => {
  try {
    const [count, total] = await Promise.all([
      redis.get(COUNTER_KEY),
      redis.get(TOTAL_KEY),
    ]);

    res.json({
      color: COLOR,
      version: VERSION,
      pod: process.env.HOSTNAME || "unknown",
      counter: parseInt(count) || 0,
      totalVisits: parseInt(total) || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Counter read error:", e);
    res.status(500).json({
      error: "Failed to read counter",
      details: e.message,
    });
  }
});

app.post("/counter/increment", async (req, res) => {
  try {
    const amount = req.body.amount || 1;
    const newCount = await redis.incrby(COUNTER_KEY, amount);
    const total = await redis.incrby(TOTAL_KEY, amount);

    console.log(
      `[${COLOR}] Incremented counter by ${amount} -> ${newCount} (total: ${total})`,
    );

    res.json({
      color: COLOR,
      version: VERSION,
      pod: process.env.HOSTNAME || "unknown",
      counter: newCount,
      totalVisits: total,
      incrementAmount: amount,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Counter increment error:", e);
    res.status(500).json({
      error: "Failed to increment counter",
      details: e.message,
    });
  }
});

app.post("/counter/reset", async (req, res) => {
  try {
    await redis.del(COUNTER_KEY);
    await redis.del(TOTAL_KEY);

    res.json({
      color: COLOR,
      version: VERSION,
      message: "Counter reset successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Counter reset error:", e);
    res.status(500).json({
      error: "Failed to reset counter",
      details: e.message,
    });
  }
});

app.get("/version", (req, res) => {
  res.json({
    color: COLOR,
    version: VERSION,
    pod: process.env.HOSTNAME || "unknown",
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || "development",
  });
});

if (METRICS_ENABLED) {
  const metrics = {
    requests: 0,
    errors: 0,
    startTime: Date.now(),
  };

  app.use((req, res, next) => {
    metrics.requests++;
    const originalJson = res.json;
    res.json = function (data) {
      if (res.statusCode >= 400) metrics.errors++;
      originalJson.call(this, data);
    };
    next();
  });

  app.get("/metrics", (req, res) => {
    const uptime = (Date.now() - metrics.startTime) / 1000;
    res.json({
      color: COLOR,
      version: VERSION,
      pod: process.env.HOSTNAME || "unknown",
      metrics: {
        totalRequests: metrics.requests,
        errorRate:
          metrics.requests > 0
            ? ((metrics.errors / metrics.requests) * 100).toFixed(2)
            : 0,
        uptimeSeconds: uptime,
        timestamp: new Date().toISOString(),
      },
    });
  });
}

// --- Info endpoint for deployment status ---
app.get("/info", async (req, res) => {
  try {
    const redisInfo = await redis.info("server");
    res.json({
      deployment: {
        color: COLOR,
        version: VERSION,
        pod: process.env.HOSTNAME || "unknown",
      },
      redis: {
        connected: redis.status === "ready",
        version:
          redisInfo
            .split("\n")
            .find((line) => line.includes("redis_version"))
            ?.split(":")[1] || "unknown",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.json({
      deployment: {
        color: COLOR,
        version: VERSION,
        pod: process.env.HOSTNAME || "unknown",
      },
      redis: {
        connected: false,
        error: e.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// --- Simulated A/B Testing (for canary) ---
app.get("/ab-test", (req, res) => {
  // Simulate different behavior based on deployment color
  const responseTime = COLOR === "canary" ? 50 : 100; // Canary is faster
  const successRate = COLOR === "canary" ? 0.99 : 0.95;

  setTimeout(() => {
    if (Math.random() < successRate) {
      res.json({
        color: COLOR,
        version: VERSION,
        feature: COLOR === "canary" ? "new-feature" : "old-feature",
        responseTime: responseTime,
        message: `This request was handled by ${COLOR} deployment`,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        error: "Simulated failure for testing",
        color: COLOR,
      });
    }
  }, responseTime);
});

// --- Error Handling ---
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    path: req.path,
    color: COLOR,
    version: VERSION,
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
    color: COLOR,
    version: VERSION,
  });
});

// --- Start Server with Graceful Shutdown ---
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Deployment Color: ${COLOR}`);
  console.log(`🏷️  App Version: ${VERSION}`);
  console.log(`🖥️  Pod Name: ${process.env.HOSTNAME || "unknown"}`);
  console.log(`💾 Redis: ${REDIS_HOST}:${REDIS_PORT}`);
});

// Graceful shutdown handling
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new requests
  server.close(async () => {
    console.log("HTTP server closed");

    // Close Redis connection
    try {
      await redis.quit();
      console.log("Redis connection closed");
    } catch (err) {
      console.error("Error closing Redis:", err);
    }

    console.log("Graceful shutdown completed");
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down",
    );
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
