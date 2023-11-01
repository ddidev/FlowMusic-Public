import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Seek extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "seek",
        description: "Seek to a specific time in the current song.",
        module: "Music"
      },
      new SlashCommandBuilder()
        .setName("seek")
        .setDescription("Seek to a specific time in the current song.")
        .addStringOption(option => option.setName("position").setDescription("How far to seek (in seconds)").setRequired(true))
    );
  }

  async run(command: CommandInteraction) {
    const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

    if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

    const player = this.client.MusicManager.guilds.get(command.guild.id);

    if (!player) return command.editReply({ content: "There is nothing playing." });
    if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

    const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId),
      time = command.options.get("position")?.value as string;

    if (!time || isNaN(parseInt(time))) return command.editReply({ content: "Please provide a valid time." });

    guildPlayer.seek(parseInt(time));

    command.editReply({ content: `Seeked to ${time} seconds!` });
  }
}