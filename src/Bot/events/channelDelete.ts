import { Channel, ChannelType } from "discord.js";

import DiscordClient from "../structures/DiscordClient";
import Event from "../structures/Event";

export default class ChannelDeleteEvent extends Event {
  constructor(client: DiscordClient) {
    super(client, "channelDelete", false);
  }

  async run(channel: Channel) {
    try {
      if (channel.type == ChannelType.GuildVoice || channel.type == ChannelType.GuildStageVoice) {
        const guildPlayer = this.client.MusicManager.guilds.get(channel.guild.id);
        if (guildPlayer && guildPlayer.player.voiceChannel == channel.id) guildPlayer.player.destroy();
      }
    } catch { }
  }
}