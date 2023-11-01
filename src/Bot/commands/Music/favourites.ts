import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

export default class Favourites extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "favourites",
        description: "View your favourite songs.",
        module: "Music",
        ephemeral: true
      },
      new SlashCommandBuilder()
        .setName("favourites")
        .setDescription("View your favourite songs.")
    );
  }

  async run(command: CommandInteraction) {
    let favouritesQuery = await this.client.db.executeQuery("SELECT * FROM favourites WHERE userId = ?", [command.user.id]) as Favourite[];

    favouritesQuery = favouritesQuery.map(f => JSON.parse(JSON.stringify(f)));

    if (!favouritesQuery?.[0]) return command.editReply({ content: "You have no favourited songs." });

    const pages = [],
      perPage = 10;

    for (let i = 0; i < favouritesQuery.length; i += perPage) {
      const current = favouritesQuery.slice(i, i + perPage);
      let j = i;

      pages.push({
        embeds: [
          {
            title: "Your favourites",
            description: current.map((track) => `${++j}. ${track.displayName}`).join("\n"),
            color: 0x00ff00,
            footer: {
              text: `Page ${pages.length + 1} of ${Math.ceil(favouritesQuery.length / perPage)}`
            }
          }
        ]
      });
    }

    if (pages.length === 1) return command.editReply({ embeds: [pages[0].embeds[0]] });

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

    function getSelectList(page) {
      const options = [],
        popped = favouritesQuery.slice(page * perPage, (page * perPage) + perPage);

      for (const track of popped)
        options.push({
          label: track.displayName.replace(/\*/g, ""),
          value: track.spotifyId
        });

      return options;
    }

    const msg = await command.editReply({
      embeds: [pages[0].embeds[0]],
      components: [
        { type: 1, components: buttons },
        { type: 1, components: [{ type: 3, customId: "select", options: getSelectList(0), placeholder: "Select a track to play." }] }
      ]
    });

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

        interaction.update({
          embeds: [pages[currentPage].embeds[0]],
          components: [{ type: 1, components: buttons }, { type: 1, components: [{ type: 3, customId: "select", options: getSelectList(currentPage) }] }]
        });
      } else if (interaction.customId === "previous") {
        if (currentPage === 0) return;

        currentPage--;

        buttons[1].disabled = false;

        if (currentPage === 0) buttons[0].disabled = true;
        else buttons[0].disabled = false;

        interaction.update({
          embeds: [pages[currentPage].embeds[0]],
          components: [{ type: 1, components: buttons }, { type: 1, components: [{ type: 3, customId: "select", options: getSelectList(currentPage) }] }]
        });
      } else if (interaction.customId === "select") {
        const track = interaction.values[0],
          member = await command.guild.members.fetch(command.user.id),
          search = await this.client.MusicManager.searchLavalink(`https://tools.elevatehosting.co.uk/api/v2/download/${track}.mp3`, member);

        if (!search.tracks?.[0]) return interaction.reply({ content: "Failed to fetch track from your favourites.", ephemeral: true });

        const player = await this.client.MusicManager.getPlayer(command.guildId, command.channelId, member.voice.channelId);

        if (!member.voice.channel.members.map(member => member.id).includes(this.client.user.id)) player.connect();

        player.queue.add(search.tracks[0]);
        player.setVoiceChannel(member.voice.channelId);

        if (
          !player.playing &&
          !player.paused
        ) player.play();

        player.pause(false);

        interaction.reply({ content: `Added ${search.tracks[0].title} to the queue from your favourites.`, ephemeral: true });
        this.client.MusicManager.sendMessage(player.textChannel, `Added ${search.tracks[0].title} to the queue from ${command.user.username}'s favourites.`);
      }
    });

    collector.on("end", async () => {
      buttons[0].disabled = true;
      buttons[1].disabled = true;

      command.editReply({
        embeds: [pages[currentPage].embeds[0]],
        components: [{ type: 1, components: buttons }]
      });
    });
  }
}

interface Favourite {
  id: number;
  userId: string;
  displayName: string;
  spotifyId: string;
}