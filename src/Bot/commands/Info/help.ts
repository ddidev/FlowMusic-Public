import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Help extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "help",
        description: "Displays help information.",
        module: "Information",
        autocomplete: async () => this.client.registry.getAllCommandNames().map(x => ({ name: x, value: x }))
      },
      new SlashCommandBuilder()
        .setName("help")
        .setDescription("Shows available commands and info about specific commands.")
        .addStringOption(option => option.setName("command_name").setDescription("The name of the command you want information about").setRequired(false).setAutocomplete(true)) as SlashCommandBuilder
    );
  }

  getAvailableModules(): IGroup[] {
    const registry = this.client.registry,
      moduleKeys = registry.getAllModuleNames(),
      modules: IGroup[] = [];

    moduleKeys.forEach(group => {
      const commands: string[] = [];

      registry.findCommandsInModule(group).forEach(commandName => commands.push(commandName));

      if (commands.length) modules.push({ name: group, commands });
    });

    return modules;
  }

  async sendHelpMessage(command: CommandInteraction, groups: IGroup[]) {
    const embed = new EmbedBuilder({
      color: 0x0099ff,
      author: {
        name: this.client.user.username,
        icon_url: this.client.user.displayAvatarURL()
      },
      footer: {
        text: "Type \"/help [command-name]\" for more information."
      }
    });

    embed.setDescription(
      groups.map(group => ({
        name: `${group.name} Commands`,
        value: group.commands.map(commandName => {
          const commandObj = this.client.registry.findCommand(commandName);
          return `</${commandObj.data.name}:${this.client.commandIds[commandObj.data.name] || 0}> - ${commandObj.data.description ? commandObj.data.description : "No description"}`;
        }).join("\n")
      })).map(x => `**${x.name}**\n${x.value}`).join("\n\n")
    );

    await command.editReply({ embeds: [embed] });
  }

  async run(command: CommandInteraction) {
    const modules = this.getAvailableModules(),
      option = command.options.get("command_name")?.value as string;

    if (!option) return await this.sendHelpMessage(command, modules);

    const commandObj = this.client.registry.findCommand(option);
    if (!commandObj) return await this.sendHelpMessage(command, modules);

    const isAvailable = modules.some(module => module.commands.includes(commandObj.data.name));
    if (!isAvailable) return await this.sendHelpMessage(command, modules);

    const embed = new EmbedBuilder({
      color: 0x0099ff,
      author: {
        name: this.client.user.username,
        icon_url: this.client.user.displayAvatarURL()
      },
      fields: [
        {
          name: "Name",
          value: commandObj.data.name,
          inline: true
        },
        {
          name: "Category",
          value: commandObj.info.module,
          inline: true
        },
        {
          name: "Description",
          value: commandObj.data.description ? commandObj.data.description : "No description"
        }
      ]
    });

    await command.editReply({ embeds: [embed] });
  }
}