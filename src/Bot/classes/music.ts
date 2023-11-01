import axios from "axios";
import { ChannelType, Collection } from "discord.js";

import DiscordClient from "../structures/DiscordClient";
import { Manager, SearchResult } from "../structures/LavaClient/Manager";
import { Player } from "../structures/LavaClient/Player";
import { TrackUtils } from "../structures/LavaClient/Utils";

export default class MusicManager {
  client: DiscordClient;
  manager: Manager;

  guilds = new Collection<string, {
    channelId: string;
    destroyTimeout: NodeJS.Timeout;
    player: Player;
  }>();

  constructor(client: DiscordClient) {
    this.client = client;
  }

  initLavalink() {
    this.manager = new Manager({
      nodes: this.client.config.nodes,
      clientName: `FlowMusic-Cluster-${this.client.cluster.id}`,
      send: (id, payload) => this.client.guilds.cache.get(id)?.shard?.send?.(payload)
    });

    this.manager
      .on("nodeError", (node, error) => this.client.logger.error(`Lavalink node ${node.options.identifier} encountered an error:\n${error}`))
      .on("trackStart", (player, track) => {
        if (!track) return;

        let requester = ".";

        if (track.requester) requester = `, requested by **${(track.requester as any).user}**.`;

        this.sendMessage(player.textChannel, `Now playing **${track.title}** from **${track.author}**${requester}`);
      })
      .on("trackError", (player) => {
        this.sendMessage(this.guilds.get(player.guild)?.channelId, "An error occurred while playing this track, it has been skipped.");
      })
      .on("queueEnd", player => {
        this.guilds.delete(player.guild);
        this.sendMessage(player.textChannel, "The queue has ended, disconnecting from the channel.");
        player.destroy(true);
      })
      .on("playerMove", (player, _, newChannel) => {
        this.guilds.set(player.guild, {
          channelId: newChannel,
          destroyTimeout: null,
          player
        });
      })
      .on("playerDisconnect", (player) => {
        this.guilds.delete(player.guild);
        player.destroy();
      })
      .on("playerDisconnected", (player) => {
        this.sendMessage(player.textChannel, "The player has been stopped due to an issue connecting to the audio node.");
      })
      .on("nodeDestroy", (node) => {
        this.client.logger.warn(`Lavalink node ${node.options.identifier} has been destroyed.`);
      })
      .init(this.client.user.id, { shards: this.client.options.shardCount });

    this.client.on("raw", d => {
      if (d.t === "VOICE_SERVER_UPDATE" || d.t === "VOICE_STATE_UPDATE") this.manager.updateVoiceState(d.d);
    });
  }

  async sendMessage(channelId: string, message: string) {
    try {
      const channel = this.client.channels.cache.get(channelId);
      if (channel && channel.type === ChannelType.GuildText) await channel.send(message);
    } catch { }
  }

  async search(query: string) {
    try {
      const youtubeMatch = /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.?be)\/.+$/;

      if (query.length < 3) return ({ error: true, message: "Search must be 3 or more characters." });
      if (youtubeMatch.test(query)) return ({ error: true, message: "YouTube support is no longer available, please use Spotify!" });

      const spotifyUrlRegex = /(?:https?:\/\/)?(?:open\.|play\.)?spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;

      if (spotifyUrlRegex.test(query)) {
        const isPlaylist = query.includes("playlist"),
          spotifyId = spotifyUrlRegex.exec(query)[2];

        if (isPlaylist) {
          const { data } = await axios(`https://tools.elevatehosting.co.uk/api/v2/lookup/playlist/${spotifyId}`, {
            headers: {
              "User-Agent": "FlowMusic"
            }
          }).catch((err) => {
            this.client.logger.error(`PL2 ${new Date().toISOString()} XT LOOKUP: ${err.response?.status} ${err.response?.statusText} "${err.config.url}"`);
            return { data: { error: true } };
          });

          if (data.error) return ({ error: true, message: "Playlist not found." });
          if (data.result?.tracks?.length === 0) return ({ error: true, message: "There are no tracks in this playlist." });

          return ({
            error: false,
            tracks: data.result?.tracks,
            type: "playlist",
            name: data.result?.name,
            id: spotifyId
          });
        } else {
          if (query.includes("album")) return ({ error: true, message: "Albums are not yet supported." });

          const { data } = await axios(`https://tools.elevatehosting.co.uk/api/v2/lookup/song/${spotifyId}`, {
            headers: {
              "User-Agent": "FlowMusic"
            }
          }).catch((err) => {
            this.client.logger.error(`T1 ${new Date().toISOString()} XT LOOKUP: ${err.response?.status} ${err.response?.statusText} "${err.config.url}"`);
            return { data: { error: true } };
          });

          if (data.error || !data.result) return ({ error: true, message: "Track not found." });

          return ({
            error: false,
            tracks: [data.result],
            type: "track"
          });
        }
      } else {
        const toolsSearch = (await axios(`https://tools.elevatehosting.co.uk/api/v2/search/spotify?q=${encodeURIComponent(query)}`, {
          headers: {
            "User-Agent": "FlowMusic"
          }
        }).catch((err) => {
          this.client.logger.error(`S1 ${new Date().toISOString()} XT LOOKUP: ${err.response?.status} ${err.response?.statusText} "${err.config.url}"`);
          return { data: { error: true } };
        })).data;

        if (toolsSearch.error) return ({ error: true, message: "No results found." });

        if (!Array.isArray(toolsSearch) || !toolsSearch[0]) return ({ error: true, message: "No results found." });

        return ({
          error: false,
          tracks: toolsSearch,
          type: "search"
        });
      }
    } catch (error) {
      console.log(error);
      return ({ error: true, message: "No results found. (ERR1)" });
    }
  }

  async searchLavalink(query: string, requester?: unknown): Promise<SearchResult> {
    const { data: res } = await axios(`${process.env.LAVALINK}${encodeURIComponent(query)}`, {
      headers: { Authorization: process.env.LAVALINK_PASSWORD, "User-Agent": "FlowMusic" }
    }).catch((err) => {
      this.client.logger.error(`L1 ${new Date().toISOString()} LL LOOKUP: ${err.response?.status} ${err.response?.statusText} "${err.config.url}"`);
      return { data: { error: true } };
    });

    if (!res || res.error == true) return ({
      loadType: "NO_MATCHES",
      tracks: []
    });

    const result: any = {
      loadType: res.loadType,
      exception: res.exception ?? null,
      tracks: res.tracks.map((track) =>
        TrackUtils.build(track, requester)
      )
    };

    if (result.loadType === "PLAYLIST_LOADED") {
      result.playlist = {
        name: res.playlistInfo.name,
        selectedTrack: res.playlistInfo.selectedTrack === -1 ? null :
          TrackUtils.build(
            res.tracks[res.playlistInfo.selectedTrack],
            requester
          ),
        duration: result.tracks.reduce((acc: number, cur) => acc + (cur.duration || 0), 0)
      };
    }

    return result;
  }

  async getPlayer(guildId: string, textChannel: string, voiceChannel: string) {
    const guild = this.guilds.get(guildId);

    if (guild?.player) return guild.player;

    const player = this.manager.create({
      guild: guildId,
      voiceChannel,
      textChannel,
      selfDeafen: true,
      volume: 25,
      instaUpdateFiltersFix: true
    });

    player.connect();

    this.guilds.set(guildId, {
      channelId: textChannel,
      destroyTimeout: null,
      player
    });

    return player;
  }
}