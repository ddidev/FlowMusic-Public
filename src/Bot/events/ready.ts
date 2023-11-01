import { Routes } from "discord-api-types/v9";
import { REST } from "discord.js";

import { getInfo } from "../../Manager/Structures/Data";
import DiscordClient from "../structures/DiscordClient";
import Event from "../structures/Event";

export default class ReadyEvent extends Event {
  constructor(client: DiscordClient) {
    super(client, "ready", false);
  }

  async run() {
    this.client.logger.success(`Cluster ${getInfo().CLUSTER} started. (${this.client.guilds.cache.size} guilds)`);
    this.client.MusicManager.initLavalink();

    const rest = new REST({ version: "10" }).setToken(this.client.config.token),
      getCmds = await rest.get(Routes.applicationCommands(this.client.config.clientId));

    for (const cmd of getCmds as any)
      this.client.commandIds[cmd.name] = cmd.id;

    const data = [getInfo().CLUSTER, getInfo().SHARD_LIST.length, getInfo().SHARD_LIST.join(","), this.client.guilds.cache.size, this.client.MusicManager.guilds.size];

    await this.client.db.executeQuery(
      "INSERT INTO clusters (cluster_id, shard_count, shard_list, guild_count, player_count) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE cluster_id = ?, shard_count = ?, shard_list = ?, guild_count = ?, player_count = ?",
      [...data, ...data]
    );

    async function updateData() {
      await this.client.db.executeQuery(
        "UPDATE clusters SET guild_count = ?, player_count = ?, last_updated = ? WHERE cluster_id = ?",
        [this.client.guilds.cache.size, this.client.MusicManager.guilds.size, Date.now(), getInfo().CLUSTER]
      );

      const clusterData = await this.client.db.executeQuery("SELECT SUM(guild_count) AS guild_count, SUM(player_count) AS player_count FROM clusters");
      this.client.sharedStats = {
        players: {
          shard: this.client.MusicManager.guilds.size,
          total: clusterData[0].player_count
        },
        guilds: clusterData[0].guild_count,
        commandUses: this.client.sharedStats?.commandUses || 0
      };

      const commandUses = await this.client.db.executeQuery("SELECT SUM(uses) AS uses FROM commanduses");
      this.client.sharedStats.commandUses = commandUses[0].uses;
    }

    updateData.call(this);
    setInterval(updateData.bind(this), 30000);
  }
}