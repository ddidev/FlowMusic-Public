import axios from "axios";
import { ChannelType, CommandInteraction, SlashCommandBuilder } from "discord.js";

import { encode } from "@lavalink/encoding";

import Command from "../../structures/Command";
import DiscordClient from "../../structures/DiscordClient";
import { TrackUtils } from "../../structures/LavaClient/Utils";

const trackMatch = /track:(.+)/,
  playlistMatch = /playlist:(.+)/,
  trackUriMatch = /^(https?:\/\/)?(www\.)?(m\.)?(open\.spotify\.com)\/(track)\/([a-zA-Z0-9]+)/,
  playlistUriMatch = /^(https?:\/\/)?(www\.)?(m\.)?(open\.spotify\.com)\/(playlist)\/([a-zA-Z0-9]+)/;

export default class Play extends Command {
  constructor(client: DiscordClient) {
    super(
      client,
      {
        name: "play",
        description: "Play a song.",
        module: "Music",
        autocomplete: async (interaction) => {
          const query = interaction.options.getString("query", true),
            search = await this.client.MusicManager.search(query);

          if (search.error) return [{
            name: search.message,
            value: "error"
          }];

          if (!search.type) return [];

          switch (search.type) {
            case "playlist":
              let totalTime = 0;

              for (const track of search.tracks) totalTime += track.duration_ms;

              return [{
                name: "Playlist - " + search.name + " - " + search.tracks.length + " tracks (" + new Date(totalTime).toISOString().slice(11, 19).replace(/^00:/, "").split(":").map((v, i) => i === 0 ? v + "h" : i === 1 ? v + "m" : v + "s").join(" ") + ")",
                value: `playlist:${search.id}`
              }];
            case "search":
            case "track":
              return search.tracks.map(track => {
                let responseName = `${track.name || track.title} - ${track.artist || track.author} `;
                if (responseName.length > 97) responseName = responseName.slice(0, 97) + "...";

                return {
                  name: responseName,
                  value: `track:${track.id || track.spotify_id}`
                };
              }).slice(0, 25);
          }

          return [];
        }
      },
      new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song.")
        .addStringOption(option => option.setName("query").setDescription("The song you want to search for!").setRequired(true).setAutocomplete(true))
    );
  }

  async run(command: CommandInteraction, queryInp?: string) {
    const member = command.guild.members.cache.get(command.user.id) || await command.guild.members.fetch(command.user.id);

    if (!member.voice?.channelId) return command.editReply({ content: "You must be in a voice channel to use this command." });
    if (!member.voice.channel.permissionsFor(this.client.user).has("Connect")) return command.editReply({ content: "I don't have permission to join your voice channel." });
    if (member.voice.channel.type === ChannelType.GuildStageVoice) return command.editReply({ content: "You cannot play music in a stage channel." });

    const query = queryInp || command.options.get("query", true)?.value as string;

    if (!query || query.length < 3 || query === "false") return await command.editReply({
      embeds: [this.getEmbed("🚨 Invalid Query", `${command.user.toString()}, your query must be at least 3 characters long.`, 0xFF0000)]
    });

    if (trackMatch.test(query) || trackUriMatch.test(query)) {
      const trackId = query.match(trackMatch)?.[1] || query.match(trackUriMatch)?.[6];

      if (!trackId) return await command.editReply({ embeds: [this.getEmbed("🚨 Invalid Track", `${command.user.toString()}, an invalid track was provided.`, 0xFF0000)] });

      try {
        await axios(`https://tools.elevatehosting.co.uk/api/v2/download/${trackId}.mp3`, {
          headers: {
            "User-Agent": "FlowMusic"
          }
        });

        const search = await this.client.MusicManager.searchLavalink(`https://tools.elevatehosting.co.uk/api/v2/download/${trackId}.mp3`, member);

        if (!search.tracks?.[0]) throw new Error("No tracks found.");

        const player = await this.client.MusicManager.getPlayer(command.guildId, command.channelId, member.voice.channelId),
          track = search.tracks[0];

        player.setVoiceChannel(member.voice.channelId);

        if (!member.voice.channel.members.map(member => member.id).includes(this.client.user.id)) player.connect();

        player.queue.add(track);

        if (!player.playing && !player.paused) player.play();

        player.pause(false);

        return await command.editReply({
          embeds: [this.getEmbed("🎵 Added to Queue", `${command.user.toString()}, I have added **${track.title}** from **${track.author}** to the queue.`, 0x00FF00)]
        });
      } catch (err) {
        return await command.editReply({
          embeds: [
            this.getEmbed("🚨 Invalid Track", `${command.user.toString()}, the track you provided could not be found. (Track: ${trackId})`, 0xFF0000)
          ]
        });
      }
    } else if (playlistMatch.test(query) || playlistUriMatch.test(query)) {
      const playlistId = query.match(playlistMatch)?.[1] || query.match(playlistUriMatch)?.[6];

      if (!playlistId) return await command.editReply({ embeds: [this.getEmbed("🚨 Invalid Playlist", `${command.user.toString()}, an invalid playlist was provided.`, 0xFF0000)] });

      try {
        const lookup = await axios(`https://tools.elevatehosting.co.uk/api/v2/lookup/playlist/${playlistId}`, {
          headers: {
            "User-Agent": "FlowMusic"
          }
        }).catch((err) => {
          this.client.logger.error(`PL1 ${new Date().toISOString()} XT LOOKUP: ${err.response?.status} ${err.response?.statusText} "${err.config.url}"`);
          return { data: { error: true } };
        });

        if (lookup.data.error || !lookup.data.found || !lookup.data.result?.tracks?.[0]) throw new Error("No tracks found.");

        const player = await this.client.MusicManager.getPlayer(command.guildId, command.channelId, member.voice.channelId),
          tracks = lookup.data.result.tracks.map(track => {
            const info = {
              title: track.name,
              author: track.artist,
              identifier: `https://tools.elevatehosting.co.uk/api/v2/download/${track.id}.mp3`,
              length: track.duration_ms,
              uri: `https://tools.elevatehosting.co.uk/api/v2/download/${track.id}.mp3`,
              isStream: true,
              isSeekable: true
            };

            return TrackUtils.build({
              info,
              track: encode(Object.assign(info, {
                length: BigInt(track.duration_ms),
                position: BigInt(0),
                source: "http",
                probeInfo: {
                  raw: "mp3",
                  name: "mp3",
                  parameters: null
                }
              }))
            }, member);
          });

        if (!member.voice.channel.members.map(member => member.id).includes(this.client.user.id)) player.connect();

        player.queue.add(tracks);

        if (!player.playing && !player.paused) player.play();

        player.pause(false);

        return await command.editReply({
          embeds: [this.getEmbed("🎵 Added to Queue", `${command.user.toString()}, I have added **${tracks.length}** tracks to the queue from playlist **${lookup.data.result.name}**.`, 0x00FF00)]
        });
      } catch (err) {
        return await command.editReply({
          embeds: [this.getEmbed("🚨 Invalid Playlist", `${command.user.toString()}, the playlist you provided could not be found.`, 0xFF0000)]
        });
      }
    } else {
      const search = await this.client.MusicManager.search(query);

      if (search.error) return await command.editReply({ embeds: [this.getEmbed("🚨 Error", search.message, 0xFF0000)] });

      if (search.type == "playlist") return this.run(command, `playlist:${search.id}`);
      else if ((search.type == "search" || search.type == "track") && search.tracks?.[0]) return this.run(command, `track:${search.tracks[0].id || search.tracks[0].spotify_id}`);
      else return await command.editReply({
        embeds: [this.getEmbed("🚨 Error", `${command.user.toString()}, no results were found.`, 0xFF0000)]
      });
    }
  }

  getEmbed(title, description, color) {
    return { title, description, color };
  }
}
