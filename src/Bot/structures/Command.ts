import {
  CommandInteraction, EmbedBuilder, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder
} from "discord.js";

import logger from "../../Shared/structures/Logger";
import DiscordClient from "./DiscordClient";

const log = new logger("command");

export default abstract class Command {
  readonly client: DiscordClient;
  readonly info: ICommandInfo;
  readonly data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | SlashCommandSubcommandsOnlyBuilder;

  init?(): any;

  constructor(client: DiscordClient, info: ICommandInfo, data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | SlashCommandSubcommandsOnlyBuilder) {
    this.client = client;
    this.info = info;
    this.data = data;
  }

  async onError(command: CommandInteraction, error: any) {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle("💥 Oops...")
      .setDescription(`${command.user.toString()}, an error occurred while running this command. Please try again later.`);

    try {
      if (command.deferred) await command.editReply({ embeds: [embed] });
      else await command.reply({ embeds: [embed] });
    } catch { }

    if (["Unknown interaction", "Unknown Message", "Invalid Webhook Token", "Missing Access"].includes(error.message)) return;

    const errorId = Math.random().toString(36).substring(2, 12);

    this.client.db.executeQuery("INSERT INTO errors (command, error_id, error_short, error_stack) VALUES (?, ?, ?, ?)", [this.data.name, errorId, error.message || "N/A", error.stack || "N/A"]);
    log.error(`An error occurred in "${this.data.name}" command. Error ID: ${errorId}`);
  }

  abstract run(command: CommandInteraction): Promise<any>;
}
