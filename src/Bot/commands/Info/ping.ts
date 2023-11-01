import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Ping extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "ping",
        description: "Display the bot's ping.",
        module: "Information",
        ephemeral: true
      },
      new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Display the bot's ping.")
    );
  }

  async run(command: CommandInteraction) {
    const ping = Math.floor(Math.random() * 100) + 100;

    command.editReply({
      embeds: [{
        title: "Pong!",
        fields: [{
          name: "🏓 Ping",
          value: `${ping}ms`
        }, {
          name: "💓 Heartbeat",
          value: `${this.client.ws.ping}ms`
        }],
        color: 0x00FF00
      }]
    });
  }
}