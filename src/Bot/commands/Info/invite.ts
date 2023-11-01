import { CommandInteraction, OAuth2Scopes, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Invite extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "invite",
        description: "Invite the bot to your server.",
        module: "Information",
        ephemeral: true
      },
      new SlashCommandBuilder()
        .setName("invite")
        .setDescription("Invite the bot to your server.")
    );
  }

  async run(command: CommandInteraction) {
    const invite = this.client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: ["Administrator", "Connect", "Speak"]
    });

    await command.editReply({
      embeds: [{
        title: "Invite",
        description: `You can invite me to your server by clicking [here](${invite}).`,
        color: 0x00FF00
      }]
    });
  }
}