import { Guild } from "discord.js";

import DiscordClient from "../structures/DiscordClient";
import Event from "../structures/Event";

export default class GuildDeleteEvent extends Event {
  constructor(client: DiscordClient) {
    super(client, "guildDelete", false);
  }

  async run(guild: Guild) {
    try {
      const guildPlayer = this.client.MusicManager.guilds.get(guild.id);
      if (guildPlayer) guildPlayer.player.destroy();
    } catch { }
  }
}