#!/usr/bin/env node
// Smoke test for Redis Stack Vector Similarity Search.
//
// Requires a Redis Stack instance (RediSearch module) at REDIS_URL.
// Creates the index if needed, inserts a couple of fake 1536-dim vectors, runs
// a KNN query, and prints the results.
//
// Usage: REDIS_URL=redis://localhost:6379 node scripts/test-redis-vss.js
const Redis = require("ioredis");

const DIM = 1536;
const CLUSTER_ID = "test-cluster";

function randomVector() {
  return Array.from({ length: DIM }, () => Math.random());
}

function toBuffer(vec) {
  return Buffer.from(new Float32Array(vec).buffer);
}

async function main() {
  const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

  // Ensure index.
  try {
    await redis.call(
      "FT.CREATE", "idx:nodes", "ON", "HASH", "PREFIX", "1", "node:",
      "SCHEMA",
      "cluster_id", "TAG",
      "embedding", "VECTOR", "FLAT", "6",
      "TYPE", "FLOAT32", "DIM", String(DIM), "DISTANCE_METRIC", "COSINE",
    );
    console.log("created index idx:nodes");
  } catch (err) {
    if (String(err).includes("Index already exists")) {
      console.log("index idx:nodes already exists");
    } else {
      throw err;
    }
  }

  // Insert two sample nodes.
  for (const id of ["t1", "t2"]) {
    await redis.call(
      "HSET", `node:${id}`,
      "id", id,
      "cluster_id", CLUSTER_ID,
      "descriptor", JSON.stringify({ app: "Test", concept: `sample ${id}` }),
      "embedding", toBuffer(randomVector()),
    );
  }
  console.log("inserted node:t1, node:t2");

  // KNN query.
  const queryBuffer = toBuffer(randomVector());
  const results = await redis.call(
    "FT.SEARCH", "idx:nodes",
    `@cluster_id:{${CLUSTER_ID}}=>[KNN 5 @embedding $query_vector AS score]`,
    "PARAMS", "2", "query_vector", queryBuffer,
    "RETURN", "2", "id", "score",
    "DIALECT", "2",
  );
  console.log("KNN results:", JSON.stringify(results, null, 2));

  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
