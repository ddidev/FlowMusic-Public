import { Interaction, InteractionType } from "discord.js";

import CommandHandler from "../classes/commandHandler";
import DiscordClient from "../structures/DiscordClient";
import Event from "../structures/Event";

export default class InteractionCreateEvent extends Event {
  constructor(client: DiscordClient) {
    super(client, "interactionCreate", false);
  }

  async run(interaction: Interaction) {
    if (interaction.type == InteractionType.ApplicationCommand) return await CommandHandler.handleCommand(this.client, interaction);
    else if (interaction.type == InteractionType.ApplicationCommandAutocomplete) return CommandHandler.handleAutocomplete(this.client, interaction);
  }
}