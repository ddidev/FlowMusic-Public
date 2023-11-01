import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Vote extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "upvote",
        description: "Upvote the bot!",
        module: "Information",
        ephemeral: true
      },
      new SlashCommandBuilder()
        .setName("upvote")
        .setDescription("Upvote the bot!")
    );
  }

  async run(command: CommandInteraction) {
    await command.editReply({
      embeds: [{
        title: "Upvote",
        description: "You can upvote me by clicking [here](https://top.gg/bot/393673098441785349/vote).",
        color: 0x00FF00
      }]
    });
  }
}