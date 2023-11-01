import { AutocompleteInteraction, CommandInteraction } from "discord.js";

import DiscordClient from "../structures/DiscordClient";

export default class CommandHandler {
  static async handleCommand(client: DiscordClient, command: CommandInteraction) {
    const cmd = client.registry.findCommand(command.commandName);

    if (command.user?.id == "506899274748133376") client.logger.info("[DBG] Detected command from Callum in " + command.guild?.name + " (" + command.guild?.id + "), channel " + command.channel?.name + " (" + command.channel?.id + ")");

    try {
      const self = command.guild?.members?.me;
      if (!command.channel?.permissionsFor?.(self)?.has("SendMessages")) {
        try {
          await command.user.send({
            embeds: [
              {
                color: 0xABCDEF,
                title: "🔒 Missing Permissions",
                description: `I don't have the permission to send messages in ${command.guild?.name}.`
              }
            ]
          });
        } catch { }
        return;
      }

      if (!command.channel?.permissionsFor?.(self)?.has("EmbedLinks")) {
        try {
          await command.user.send({
            embeds: [
              {
                color: 0xABCDEF,
                title: "🔒 Missing Permissions",
                description: `I don't have the permission to send embeds in ${command.guild?.name}. Please have someone with the \`Manage Server\` permission enable the \`Embed Links\` permission for Flow Music.`
              }
            ]
          });
        } catch { }
        return;
      }

      if (!command.guild) return command.reply({ content: "This command can only be used in a server.", ephemeral: true });
      if (!cmd) {
        await command.reply({
          embeds: [
            {
              color: 0xABCDEF,
              title: "🔎 Unknown Command",
              description: `${command.user.toString()}, type \`/help\` to see the command list.`
            }
          ]
        });
        return;
      }

      await command.deferReply({ ephemeral: cmd.info.ephemeral });
      await cmd.run(command);

      client.db.executeQuery("INSERT INTO commanduses (command, uses, last_used) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE uses = uses + 1, last_used = ?", [cmd.info.name, Date.now(), Date.now()]);
      client.sharedStats.commandUses++;
    } catch (error) {
      await cmd.onError(command, error);
    }
  }

  static async handleAutocomplete(client: DiscordClient, interaction: AutocompleteInteraction) {
    try {
      await interaction.respond(await client.registry.getAutocomplete().get(interaction.commandName)(interaction) ?? []);
    } catch { }
  }
}