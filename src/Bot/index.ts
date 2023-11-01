import { Options } from "discord.js";

import { ClusterClient } from "../Manager/Core/ClusterClient";
import { getInfo } from "../Manager/Structures/Data";
import Client from "./structures/DiscordClient";

async function main() {
  const client = new Client(<BotOptions>{
    intents: [
      "Guilds",
      "GuildVoiceStates"
    ],
    ws: {
      properties: {
        browser: "Flow Music",
        os: "Flow Music"
      },
      large_threshold: 500
    },
    allowedMentions: {
      parse: []
    },
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,

      ReactionManager: 0,
      MessageManager: 0,

      GuildMemberManager: {
        keepOverLimit: member => member.id === this.client.user.id,
        maxSize: 200
      }
    }),
    presence: {
      status: "online",
      activities: [{ name: "/play", type: 2 }]
    },
    shards: getInfo().SHARD_LIST,
    shardCount: getInfo().TOTAL_SHARDS,
    waitGuildTimeout: 1000
  });

  client.cluster = new ClusterClient(client);

  process.on("uncaughtException", () => { });
  process.on("unhandledRejection", () => { });

  await client.start();
}

main();
