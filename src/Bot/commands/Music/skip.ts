import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Skip extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "skip",
        description: "Skip the current song.",
        module: "Music"
      },
      new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the current song.")
        .addNumberOption(option => option.setName("amount").setDescription("The amount of songs to skip.").setRequired(false))
    );
  }

  async run(command: CommandInteraction) {
    const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

    if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

    const player = this.client.MusicManager.guilds.get(command.guild.id);

    if (!player?.player.playing) return command.editReply({ content: "There is nothing playing." });
    if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

    const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId);

    if (guildPlayer.queue.length === 0) return command.editReply({ content: "There are no more songs in the queue." });

    let amount = command.options.get("amount")?.value as number || 1;
    if (amount > guildPlayer.queue.length) amount = guildPlayer.queue.length;

    guildPlayer.stop(amount);

    command.editReply({ content: `Skipped ${amount} song${amount === 1 ? "" : "s"} in the queue.` });
  }
}