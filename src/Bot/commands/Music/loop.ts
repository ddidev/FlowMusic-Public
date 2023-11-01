import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Loop extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "loop",
        description: "Loop the current song or queue.",
        module: "Music"
      },
      new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Loop the current song or queue.")
        .addBooleanOption(option => option.setName("queue").setDescription("Loop the queue.").setRequired(false))
    );
  }

  async run(command: CommandInteraction) {
    const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

    if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

    const player = this.client.MusicManager.guilds.get(command.guild.id);

    if (!player) return command.editReply({ content: "There is nothing playing." });
    if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

    const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId),
      currentLoopMode = guildPlayer.queueRepeat ? 3 : guildPlayer.trackRepeat ? 2 : 1;

    if (command.options.get("queue")?.value as boolean) {
      if (currentLoopMode === 3) {
        guildPlayer.setQueueRepeat(false);
        guildPlayer.setTrackRepeat(false);

        command.editReply({ content: "Disabled queue looping." });
      } else {
        guildPlayer.setTrackRepeat(false);
        guildPlayer.setQueueRepeat(true);

        command.editReply({ content: "Enabled queue looping." });
      }
    } else {
      if (currentLoopMode === 2) {
        guildPlayer.setQueueRepeat(false);
        guildPlayer.setTrackRepeat(false);

        command.editReply({ content: "Disabled song looping." });
      } else {
        guildPlayer.setQueueRepeat(false);
        guildPlayer.setTrackRepeat(true);

        command.editReply({ content: "Enabled song looping." });
      }
    }
  }
}