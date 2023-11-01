import { Channel, ChannelType, VoiceState } from "discord.js";

import DiscordClient from "../structures/DiscordClient";
import Event from "../structures/Event";

export default class VoiceStateUpdateEvent extends Event {
  constructor(client: DiscordClient) {
    super(client, "voiceStateUpdate", false);
  }

  async run(oldState: VoiceState, newState: VoiceState) {
    const channel = newState?.channel as Channel;

    if (newState && channel?.type == ChannelType.GuildStageVoice && newState.member.user.id == this.client.user.id)
      try {
        if (!channel.stageInstance) await channel.createStageInstance({ topic: "Flow Music" });
        await newState.setSuppressed(false);
      } catch { }

    if (newState && newState.member.user.id == this.client.user.id && !newState.serverDeaf)
      try {
        await newState.setDeaf(true);
      } catch { }

    const player = this.client.MusicManager.manager.players.get(oldState.guild.id);

    if (!player) return;

    if (oldState.channelId && !oldState.member?.user.bot && !oldState.channel?.members.filter(m => !m.user.bot).size) {
      this.client.MusicManager.sendMessage(this.client.MusicManager.guilds.get(player.guild)?.channelId, "The voice channel is empty, stopping the player.");
      player.stop();
      player.destroy();
    }
  }
}