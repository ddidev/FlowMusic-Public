import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Queue extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "queue",
        description: "View the current queue.",
        module: "Music"
      },
      new SlashCommandBuilder()
        .setName("queue")
        .setDescription("View the current queue.")
    );
  }

  async run(command: CommandInteraction) {
    const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

    if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

    const player = this.client.MusicManager.guilds.get(command.guild.id);

    if (!player) return command.editReply({ content: "There is nothing playing." });
    if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

    const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId),
      queue = guildPlayer.queue;

    if (queue.length === 0) return command.editReply({ content: "There are no songs in the queue." });

    const pages = [],
      perPage = 15,
      currentLoopMode = guildPlayer.queueRepeat ? 3 : guildPlayer.trackRepeat ? 2 : 1;

    for (let i = 0; i < queue.length; i += perPage) {
      const current = queue.slice(i, i + perPage);
      let j = i;

      pages.push({
        embeds: [
          {
            title: `${command.guild.name}'s Queue`,
            description:
              `${currentLoopMode === 3 ? "🔁 Queue loop enabled!\n\n" : currentLoopMode === 2 ? "🔂 Song loop enabled!\n\n" : ""
              } ${current.map((track) => `${++j}. [${track.title} - ${track.author}](${track.uri.replace("https://tools.elevatehosting.co.uk/api/v2/download/", "https://open.spotify.com/track/").replace(".mp3", "")})`).join("\n")
              }`,
            color: 0x00ff00,
            footer: {
              text: `Page ${pages.length + 1} of ${Math.ceil(queue.length / perPage)}`
            }
          }
        ]
      });
    }

    const msg = await command.editReply({ embeds: [pages[0].embeds[0]] });

    if (pages.length === 1) return;

    const buttons = [
      {
        type: 2,
        customId: "previous",
        label: "Previous",
        style: 1,
        disabled: true
      },
      {
        type: 2,
        customId: "next",
        label: "Next",
        style: 1,
        disabled: false
      }
    ];

    await msg.edit({ components: [{ type: 1, components: buttons }] });

    let currentPage = 0;

    const filter = (interaction: any) => interaction.user.id === command.user.id,
      collector = msg.createMessageComponentCollector({ filter, time: 30000 });

    collector.on("collect", async (interaction: any) => {
      if (interaction.customId === "next") {
        if (currentPage + 1 === pages.length) return;

        currentPage++;

        buttons[0].disabled = false;

        if (currentPage + 1 === pages.length) buttons[1].disabled = true;
        else buttons[1].disabled = false;

        await interaction.update({ embeds: [pages[currentPage].embeds[0]], components: [{ type: 1, components: buttons }] });
      } else if (interaction.customId === "previous") {
        if (currentPage === 0) return;

        currentPage--;

        buttons[1].disabled = false;

        if (currentPage === 0) buttons[0].disabled = true;
        else buttons[0].disabled = false;

        await interaction.update({ embeds: [pages[currentPage].embeds[0]], components: [{ type: 1, components: buttons }] });
      }
    });

    collector.on("end", async () => {
      buttons[0].disabled = true;
      buttons[1].disabled = true;

      await msg.edit({ components: [{ type: 1, components: buttons }] });
    });
  }
}