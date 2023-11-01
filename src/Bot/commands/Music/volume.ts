import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Volume extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "volume",
        description: "Change the volume of the music player.",
        module: "Music"
      },
      new SlashCommandBuilder()
        .setName("volume")
        .setDescription("Change the volume of the music player.")
        .addIntegerOption(option => option.setName("volume").setDescription("The volume to set the music player to.").setRequired(false).setMinValue(1).setMaxValue(100))
    );
  }

  async run(command: CommandInteraction) {
    const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

    if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

    const player = this.client.MusicManager.guilds.get(command.guild.id);

    if (!player) return command.editReply({ content: "There is nothing playing." });
    if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

    const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId),
      volume = command.options.get("volume")?.value as number;

    if (volume) {
      guildPlayer.setVolume(volume);
      command.editReply({ content: `The volume has been set to ${volume}%.` });
    } else command.editReply({ content: `The current volume is ${guildPlayer.volume}%.` });
  }
}