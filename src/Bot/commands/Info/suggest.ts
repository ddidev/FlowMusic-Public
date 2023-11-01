import axios from "axios";
import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

const webhook = "suggestions webhook";

export default class Suggest extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "suggest",
        description: "Suggest a feature for the bot.",
        module: "Information",
        ephemeral: true
      },
      new SlashCommandBuilder()
        .setName("suggest")
        .setDescription("Suggest a feature for the bot.")
        .addStringOption(option => option.setName("suggestion").setDescription("The suggestion you want to make.").setRequired(true))
    );
  }

  async run(command: CommandInteraction) {
    const suggestion = command.options.get("suggestion")?.value as string;

    if (!suggestion || suggestion.length < 5) return command.editReply({ content: "Your suggestion is too short. Please make it is at least 10 characters long." });
    if (suggestion.length > 1000) return command.editReply({ content: "Your suggestion is too long. Please keep it under 1000 characters." });

    const confirm = await command.editReply({
      embeds: [{
        title: "Are you sure you want to submit?",
        description: `This suggestion will be sent to the Flow Music Developers, and will not be seen by staff of ${command.guild?.name}.\n\n**Suggestion:**\n${suggestion}`,
        color: 0x2ff666
      }],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 3,
          label: "Yes",
          custom_id: "yes"
        }, {
          type: 2,
          style: 4,
          label: "No",
          custom_id: "no"
        }]
      }]
    }),

      filter = (interaction) => interaction.user.id === command.user.id,
      collector = confirm?.createMessageComponentCollector({ filter, time: 30000 });

    let responded = false;

    collector?.on("collect", async interaction => {
      responded = true;
      if (interaction.customId === "yes") {
        axios.post(webhook, {
          embeds: [{
            title: "Suggestion",
            description: suggestion,
            color: 0x2ff666,
            footer: {
              text: `Suggested by ${command.user.tag} (${command.user.id}) | ${command.guild?.name} (${command.guild?.id})`,
              icon_url: command.user.displayAvatarURL()
            }
          }]
        });

        interaction.editReply({ embeds: [{ description: "Suggestion submitted.", color: 0x2ff666 }], components: [] });
      }
      else interaction.editReply({ embeds: [{ description: "Suggestion cancelled.", color: 0xff0000 }], components: [] });
    });

    collector?.on("end", () => {
      if (!responded) confirm?.edit({ embeds: [{ description: "Suggestion cancelled.", color: 0xff0000 }], components: [] });
    });
  }
}