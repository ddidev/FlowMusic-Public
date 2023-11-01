import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Unpause extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "unpause",
        description: "Unpause the current song..",
        module: "Music",
        ephemeral: true
      },
      new SlashCommandBuilder()
        .setName("unpause")
        .setDescription("Unpause the current song.")
    );
  }

  async run(command: CommandInteraction) {
    const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

    if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

    const player = this.client.MusicManager.guilds.get(command.guild.id);

    if (!player) return command.editReply({ content: "There is nothing playing." });
    if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

    const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId);

    if (!guildPlayer.paused) return command.editReply({ content: "The player is not paused." });

    guildPlayer.pause(false);

    command.editReply({ content: "Unpaused the current song." });
  }
}