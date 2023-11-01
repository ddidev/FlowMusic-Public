import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import Lodash from "lodash";

import { EmbedBuilder } from "@discordjs/builders";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";

const ReplaceReg = /lyrics|lyrical|lyric|official music video|\(official music video\)|\(Official Video\)|audio|\(audio\)|official video hd|official video|official hd video|offical video music|\(offical video music\)|official|extended|hd|(\[.+\])/gi,
	GeniusLyrics = require("genius-lyrics");

export default class Lyrics extends Command {
	Genius: any;

	constructor(client: DiscordClient) {
		super(
			client,
			{
				name: "lyrics",
				description: "Get the lyrics of the current song.",
				module: "Music"
			},
			new SlashCommandBuilder()
				.setName("lyrics")
				.setDescription("Get the lyrics of the current song.")
		);

		this.Genius = new GeniusLyrics.Client(process.env.GENIUS_API || "");
	}

	async run(command: CommandInteraction) {
		const member = command.guild.members.cache.get(command.user.id) || (await command.guild.members.fetch(command.user.id));

		if (!member.voice.channel) return command.editReply({ content: "You must be in a voice channel to use this command." });

		const player = this.client.MusicManager.guilds.get(command.guild.id);

		if (!player) return command.editReply({ content: "There is nothing playing." });
		if (!member.voice.channel.members.has(this.client.user.id)) return command.editReply({ content: "You must be in the same voice channel as me to use this command." });

		const guildPlayer = await this.client.MusicManager.getPlayer(command.guild.id, player.channelId, member.voice.channelId),
			track = guildPlayer.queue?.current;

		if (!track) return command.editReply({ content: "There is nothing playing." });


		const query = track.title.replace(ReplaceReg, "").trim(),
			search = (await this.Genius.songs.search(query)),
			lyricsSearch = await search?.[0].lyrics();

		if (!search?.[0] || !lyricsSearch) return command.editReply({ content: "No lyrics found for the current song." });

		const lyrics = lyricsSearch.split("\n"),
			chunks = Lodash.chunk(lyrics, 40);

		let page = 1;

		const embed = new EmbedBuilder()
			.setTitle("Lyrics for " + track.title + " by " + track.author)
			.setDescription(chunks[page - 1].join("\n"));

		if (chunks.length > 1) {
			embed.setFooter({ text: `Page ${page} of ${chunks.length}` });

			const components = [
				{
					type: 1,
					components: [
						{
							type: 2,
							label: "Previous",
							style: 1,
							custom_id: "previous",
							disabled: true
						},
						{
							type: 2,
							label: "Next",
							style: 1,
							custom_id: "next"
						}
					]
				}
			];

			const msg = await command.editReply({ embeds: [embed], components });

			const collector = msg.createMessageComponentCollector({ time: 300000, filter: i => i.user.id === command.user.id });

			collector.on("collect", async (interaction: any) => {
				switch (interaction.customId) {
					case "previous":
						if (page === 1) return interaction.reply({ content: "You are already on the first page.", ephemeral: true });

						page--;

						embed.setDescription(chunks[page - 1].join("\n"));
						embed.setFooter({ text: `Page ${page} of ${chunks.length}` });

						if (page === 1) components[0].components[0].disabled = true;
						if (page === chunks.length - 1) components[0].components[1].disabled = false;

						await interaction.update({ embeds: [embed], components });
						break;
					case "next":
						if (page === chunks.length) return interaction.reply({ content: "You are already on the last page.", ephemeral: true });

						page++;

						embed.setDescription(chunks[page - 1].join("\n"));
						embed.setFooter({ text: `Page ${page} of ${chunks.length}` });

						if (page === 2) components[0].components[0].disabled = false;
						if (page === chunks.length) components[0].components[1].disabled = true;

						await interaction.update({ embeds: [embed], components });
						break;
				}
			});

			collector.on("end", () => {
				components[0].components[0].disabled = true;
				components[0].components[1].disabled = true;

				command.editReply({ embeds: [embed], components });
			});

		} else command.editReply({ embeds: [embed] });
	}
}