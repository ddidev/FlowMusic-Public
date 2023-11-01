import axios from "axios";
import { Collection } from "discord.js";
import ms from "ms";

import config from "../config";
import { StartData } from "../Shared/botlists";
import db from "../Shared/structures/Database";
import Logger from "../Shared/structures/Logger";
import { ClusterManager } from "./Core/ClusterManager";
import { HeartbeatManager } from "./Plugins/HeartbeatSystem";

const logger = new Logger("manager"),
  dev = process.argv.includes("--dev"),
  database = new db(config, config.database.database),
  webhookUrl = "",
  errorWebhookUrl = "";

async function main() {
  await database.executeQuery("DELETE FROM `clusters`");

  const startTime = Date.now(),
    shardManager = new ClusterManager(`${process.cwd()}/dist/Bot/index.js`, {
      shardArgs: [`--processTime=${startTime}`, dev ? "--dev" : "", process.argv.includes("--cmds") ? "--cmds" : ""],
      shardsPerClusters: 16,
      totalClusters: "auto",
      totalShards: "auto",
      token: config.token,
      respawn: true,
      logger
    });

  shardManager.extend(
    new HeartbeatManager({
      interval: 60000,
      maxMissedHeartbeats: 5
    })
  );

  let wasReady = false;

  shardManager.on("debug", (m) => logger.debug("cluster", m));

  shardManager.on("clusterCreate", (s) => {
    if (s.id === 0) {
      logger.log("cluster", `Starting ${shardManager.totalClusters} clusters with ${shardManager.totalShards} shards.`);
      database.executeQuery("INSERT INTO `settings` (`id`, `clusters`, `shards`) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE `clusters` = ?, `shards` = ?", [shardManager.totalClusters, shardManager.totalShards, shardManager.totalClusters, shardManager.totalShards]);
    }

    s.on("death", () => {
      logger.log("cluster", `Cluster ${s.id} died.`);
      sendDiscordWebhook(`Cluster ${s.id} died. <@506899274748133376>`);
    });
    s.on("spawn", () => {
      logger.log("cluster", `Cluster ${s.id} spawned.`);
      sendDiscordWebhook(`Cluster ${s.id} spawned.`);
    });
    s.on("disconnect", () => {
      logger.log("cluster", `Cluster ${s.id} disconnected.`);
      sendDiscordWebhook(`Cluster ${s.id} disconnected. <@506899274748133376>`);
    });
    s.on("reconnection", () => {
      logger.log("cluster", `Cluster ${s.id} reconnecting.`);
      sendDiscordWebhook(`Cluster ${s.id} reconnecting. <@506899274748133376>`);
    });
    s.on("heartbeatMissed", () => {
      logger.log("cluster", `Cluster ${s.id} missed a heartbeat.`);
      sendDiscordWebhook(`Cluster ${s.id} missed a heartbeat. <@506899274748133376>`);
    });
    s.on("error", (e) => sendDiscordWebhook(`Cluster ${s.id} encountered an error: ${e}`, true));

    s.on("ready", () => {
      sendDiscordWebhook(`Cluster ${s.id} is ready.`);

      setTimeout(() => {
        const collection = new Collection(shardManager.clusters);

        if (collection.filter(x => x.ready).size === shardManager.totalClusters) {
          if (wasReady) return;
          wasReady = true;

          const time = ms(Date.now() - 1000 - startTime, { long: true });
          logger.log("cluster", `All clusters spawned in ${time}. (${shardManager.clusters.size} clusters, ${shardManager.totalShards} shards)`);
          sendDiscordWebhook(`All clusters spawned in ${time}. (${shardManager.clusters.size} clusters, ${shardManager.totalShards} shards)`);

          StartData(shardManager);

          database.db.end();
        }
      }, 1000);
    });
  });

  shardManager.spawn({ delay: 200, timeout: -1 });
}

function sendDiscordWebhook(message: string, isError = false) {
  if (process.argv.includes("-nd")) return;

  axios.post(isError ? errorWebhookUrl : webhookUrl, {
    content: message,
    username: config.clientId == "393673098441785349" ? "Flow Music" : "Flow Music Development"
  });
}

main();
