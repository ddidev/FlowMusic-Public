import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Support extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "support",
        description: "Join the support server.",
        module: "Information",
        ephemeral: true
      },
      new SlashCommandBuilder()
        .setName("support")
        .setDescription("Join the support server.")
    );
  }

  async run(command: CommandInteraction) {
    await command.editReply({
      embeds: [{
        title: "Support",
        description: "You can join the support server by clicking [here](https://discord.gg/bSJKjtMKJR).",
        color: 0x00FF00
      }]
    });
  }
}