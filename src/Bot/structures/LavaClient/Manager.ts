import { EventEmitter } from "node:events";

import { Collection } from "@discordjs/collection";

import { Node, NodeOptions } from "./Node";
import { Player, PlayerOptions, Track, UnresolvedTrack } from "./Player";
import {
  LoadType, Structure, TrackData, TrackEndEvent, TrackExceptionEvent, TrackStartEvent,
  TrackStuckEvent, TrackUtils, VoicePacket, VoiceServer, VoiceState, WebSocketClosedEvent
} from "./Utils";

const REQUIRED_KEYS = ["event", "guildId", "op", "sessionId"];

export const LoadTypes = {
  TrackLoaded: "TRACK_LOADED",
  PlaylistLoaded: "PLAYLIST_LOADED",
  SearchResult: "SEARCH_RESULT",
  NoMatches: "NO_MATCHES",
  LoadFailed: "LOAD_FAILED"
} as Record<"TrackLoaded" | "PlaylistLoaded" | "SearchResult" | "NoMatches" | "LoadFailed", LoadType>;

function check(options: ManagerOptions) {
  if (!options) throw new TypeError("ManagerOptions must not be empty.");

  if (typeof options.send !== "function")
    throw new TypeError("Manager option \"send\" must be present and a function.");

  if (typeof options.clientId !== "undefined" && !/^\d+$/.test(options.clientId))
    throw new TypeError("Manager option \"clientId\" must be a non-empty string.");

  if (typeof options.nodes !== "undefined" && !Array.isArray(options.nodes))
    throw new TypeError("Manager option \"nodes\" must be a array.");

  if (typeof options.shards !== "undefined" && typeof options.shards !== "number")
    throw new TypeError("Manager option \"shards\" must be a number.");

  if (typeof options.autoPlay !== "undefined" && typeof options.autoPlay !== "boolean")
    throw new TypeError("Manager option \"autoPlay\" must be a boolean.");

  if (typeof options.trackPartial !== "undefined" && !Array.isArray(options.trackPartial))
    throw new TypeError("Manager option \"trackPartial\" must be a string array.");

  if (typeof options.clientName !== "undefined" && typeof options.clientName !== "string")
    throw new TypeError("Manager option \"clientName\" must be a string.");

  if (typeof options.defaultSearchPlatform !== "undefined" && typeof options.defaultSearchPlatform !== "string")
    throw new TypeError("Manager option \"defaultSearchPlatform\" must be a string.");
}

export interface Manager {
  on(event: "nodeCreate", listener: (node: Node) => void): this;
  on(event: "nodeDestroy", listener: (node: Node) => void): this;
  on(event: "nodeConnect", listener: (node: Node) => void): this;
  on(event: "nodeReconnect", listener: (node: Node) => void): this;
  on(
    event: "nodeDisconnect",
    listener: (node: Node, reason: { code?: number; reason?: string }) => void
  ): this;
  on(event: "nodeError", listener: (node: Node, error: Error) => void): this;
  on(event: "nodeRaw", listener: (payload: unknown) => void): this;
  on(event: "playerCreate", listener: (player: Player) => void): this;
  on(event: "playerDestroy", listener: (player: Player) => void): this;
  on(
    event: "queueEnd",
    listener: (
      player: Player,
      track: Track | UnresolvedTrack,
      payload: TrackEndEvent
    ) => void
  ): this;
  on(
    event: "playerMove",
    listener: (player: Player, initChannel: string, newChannel: string) => void
  ): this;
  on(
    event: "playerDisconnect",
    listener: (player: Player, oldChannel: string) => void
  ): this;
  on(
    event: "playerDisconnected",
    listener: (player: Player) => void
  ): this;
  on(
    event: "trackStart",
    listener: (player: Player, track: Track, payload: TrackStartEvent) => void
  ): this;
  on(
    event: "trackEnd",
    listener: (player: Player, track: Track, payload: TrackEndEvent) => void
  ): this;
  on(
    event: "trackStuck",
    listener: (player: Player, track: Track, payload: TrackStuckEvent) => void
  ): this;
  on(
    event: "trackError",
    listener: (
      player: Player,
      track: Track | UnresolvedTrack,
      payload: TrackExceptionEvent
    ) => void
  ): this;
  on(
    event: "socketClosed",
    listener: (player: Player, payload: WebSocketClosedEvent) => void
  ): this;
}

export class Manager extends EventEmitter {
  public static readonly DEFAULT_SOURCES: Record<LavalinkSearchPlatform, LavalinkSearchPlatform> = {
    "speak": "speak",
    "tts": "tts"
  };

  public static readonly regex: Record<SourcesRegex, RegExp> = {
    SpotifySongRegex: /https?:\/\/(www\.)?open\.spotify\.com\/track\/([A-Za-z0-9]+)/,
    SpotifyPlaylistRegex: /https?:\/\/(www\.)?open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/,
    SpotifyArtistRegex: /https?:\/\/(www\.)?open\.spotify\.com\/artist\/([A-Za-z0-9]+)/,
    SpotifyEpisodeRegex: /https?:\/\/(www\.)?open\.spotify\.com\/episode\/([A-Za-z0-9]+)/,
    SpotifyShowRegex: /https?:\/\/(www\.)?open\.spotify\.com\/show\/([A-Za-z0-9]+)/,
    SpotifyAlbumRegex: /https?:\/\/(www\.)?open\.spotify\.com\/album\/([A-Za-z0-9]+)/,
    AllSpotifyRegex: /https?:\/\/(www\.)?open\.spotify\.com\/(track|playlist|artist|episode|show|album)\/([A-Za-z0-9]+)/,
    mp3Url: /(https?|ftp|file):\/\/(www.)?(.*?)\.(mp3)$/,
    m3uUrl: /(https?|ftp|file):\/\/(www.)?(.*?)\.(m3u)$/,
    m3u8Url: /(https?|ftp|file):\/\/(www.)?(.*?)\.(m3u8)$/,
    mp4Url: /(https?|ftp|file):\/\/(www.)?(.*?)\.(mp4)$/,
    m4aUrl: /(https?|ftp|file):\/\/(www.)?(.*?)\.(m4a)$/,
    wavUrl: /(https?|ftp|file):\/\/(www.)?(.*?)\.(wav)$/
  };

  public readonly players = new Collection<string, Player>();
  public readonly nodes = new Collection<string, Node>();
  public readonly options: ManagerOptions;
  public initiated = false;

  public get leastUsedNodes(): Collection<string, Node> {
    return this.leastUsedNodesPlayers;
  }

  public get leastUsedNodesCalls(): Collection<string, Node> {
    return this.nodes
      .filter((node) => node.connected)
      .sort((a, b) => b.calls - a.calls);
  }

  public get leastUsedNodesPlayers(): Collection<string, Node> {
    return this.nodes
      .filter((node) => node.connected)
      .sort((a, b) => (a.stats?.players || 0) - (b.stats?.players || 0));
  }

  public get leastUsedNodesMemory(): Collection<string, Node> {
    return this.nodes
      .filter((node) => node.connected)
      .sort((a, b) => (b.stats?.memory?.used || 0) - (a.stats?.memory?.used || 0));
  }

  public get leastLoadNodes(): Collection<string, Node> {
    return this.leastLoadNodesCpu;
  }

  public get leastLoadNodesMemory(): Collection<string, Node> {
    return this.nodes
      .filter((node) => node.connected)
      .sort((a, b) => {
        const aload = a.stats.memory?.used
          ? a.stats.memory.used
          : 0,
          bload = b.stats.memory?.used
            ? b.stats.memory.used
            : 0;
        return aload - bload;
      });
  }

  public get leastLoadNodesCpu(): Collection<string, Node> {
    return this.nodes
      .filter((node) => node.connected)
      .sort((a, b) => {
        const aload = a.stats.cpu
          ? (a.stats.cpu.systemLoad / a.stats.cpu.cores) * 100
          : 0,
          bload = b.stats.cpu
            ? (b.stats.cpu.systemLoad / b.stats.cpu.cores) * 100
            : 0;
        return aload - bload;
      });
  }

  private getValidUrlOfQuery(query: string) {
    const args = query?.split?.(" ");
    if (!args?.length || !Array.isArray(args)) return undefined;
    let url;
    for (const arg of args) {
      try {
        url = new URL(arg);
        url = url.protocol === "http:" || url.protocol === "https:" ? url.href : false;
        break;
      } catch (_) {
        url = undefined;
      }
    }
    return url;
  }

  constructor(options: ManagerOptions) {
    super();

    check(options);

    Structure.get("Player").init(this);
    Structure.get("Node").init(this);
    TrackUtils.init(this);

    if (options.trackPartial) {
      TrackUtils.setTrackPartial(options.trackPartial);
      delete options.trackPartial;
    }

    this.options = {
      nodes: [{
        identifier: "default",
        host: "localhost",
        port: 2333,
        password: "youshallnotpass",
        secure: false,
        retryAmount: 5,
        retryDelay: 30e3,
        requestTimeout: 10e3,
        version: "v3",
        useVersionPath: false
      }],
      shards: 1,
      autoPlay: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 OPR/93.0.0.0",
      restTimeout: 5000,
      allowedLinksRegexes: [...Object.values(Manager.regex)],
      onlyAllowAllowedLinks: true,
      forceSearchLinkQueries: true,
      position_update_interval: 250,
      useUnresolvedData: true,
      volumeDecrementer: 1,
      ...options
    };

    if (this.options.nodes)
      for (const nodeOptions of this.options.nodes)
        new (Structure.get("Node"))(nodeOptions);
  }

  public init(clientID?: string, objectClientData: { clientId?: string, clientName?: string, shards?: number } = {}): this {
    const { clientId, clientName, shards } = objectClientData;
    if (this.initiated) return this;
    if (typeof clientId !== "undefined") this.options.clientId = clientId;
    if (typeof clientID !== "undefined") this.options.clientId = clientID;
    if (typeof clientId !== "undefined") this.options.clientId = clientId;
    if (typeof clientName !== "undefined") this.options.clientName = clientName || `Unknown Name - ${clientId || clientID}`;
    if (typeof shards !== "undefined") this.options.shards = shards;
    if (typeof this.options.clientId !== "string") throw new Error("\"clientId\" set is not type of \"string\"");
    if (!this.options.clientId) throw new Error("\"clientId\" is not set. Pass it in Manager#init() or as a option in the constructor.");

    let success = 0;
    for (const node of this.nodes.values()) {
      try {
        node.connect();
        success++;
      }
      catch (err) {
        console.error(err);
        this.emit("nodeError", node, err);
      }
    }
    if (success > 0) this.initiated = true;
    else console.error("Could not connect to at least 1 Node");

    return this;
  }

  public search(
    query: string | SearchQuery,
    requester?: unknown,
    customNode?: Node
  ): Promise<SearchResult> {
    return new Promise(async (resolve, reject) => {
      const node = customNode || this.leastUsedNodes.first();
      if (!node) throw new Error("No available nodes.");
      const _query: SearchQuery = typeof query === "string" ? { query } : query,
        _source = Manager.DEFAULT_SOURCES[_query.source ?? this.options.defaultSearchPlatform] ?? _query.source;

      _query.query = _query.query?.trim?.();

      const link = this.getValidUrlOfQuery(_query.query);
      if (this.options.allowedLinksRegexes?.length || this.options.allowedLinks?.length)
        if (link && !this.options.allowedLinksRegexes?.some(regex => regex.test(link)) && !this.options.allowedLinks?.includes(link)) reject(new Error(`Query ${_query.query} Contains link: ${link}, which is not an allowed / valid Link`));

      if (link && this.options.forceSearchLinkQueries) return await this.searchLink(link, requester, customNode).then(data => resolve(data)).catch(err => reject(err));

      const search = `${!/^https?:\/\//.test(_query.query) ? `${_source}:` : ""}${_query.query}`;

      this.validatedQuery(search, node);

      const res = await node
        .makeRequest<LavalinkResult>(`/loadtracks?identifier=${encodeURIComponent(search)}`)
        .catch(err => reject(err));

      if (!res) return reject(new Error("Query not found."));

      const result: SearchResult = {
        loadType: res.loadType,
        exception: res.exception ?? null,
        tracks: res.tracks?.map((track: TrackData) =>
          TrackUtils.build(track, requester)
        ) ?? []
      };

      if (result.loadType === "PLAYLIST_LOADED") {
        if (typeof res.playlistInfo === "object") {
          result.playlist = {
            ...result.playlist,
            name: res.playlistInfo.name,
            selectedTrack: res.playlistInfo.selectedTrack === -1 ? null :
              TrackUtils.build(
                res.tracks[res.playlistInfo.selectedTrack],
                requester
              ),
            duration: result.tracks
              .reduce((acc: number, cur: Track) => acc + (cur.duration || 0), 0)
          };
        }
      }

      return resolve(result);
    });
  }

  public searchLink(
    query: string | SearchQuery,
    requester?: unknown,
    customNode?: Node
  ): Promise<SearchResult> {
    return new Promise(async (resolve, reject) => {
      const node = customNode || this.leastUsedNodes.first();
      if (!node) throw new Error("No available nodes.");

      const _query = typeof query === "string" ? { query } : query;
      _query.query = _query.query?.trim?.();

      const link = this.getValidUrlOfQuery(_query.query);
      if (!link) return this.search(query, requester, customNode);

      if (this.options.allowedLinksRegexes?.length || this.options.allowedLinks?.length)
        if (!this.options.allowedLinksRegexes?.some(regex => regex.test(link)) && !this.options.allowedLinks?.includes(link)) reject(new Error(`Query ${_query.query} Contains link: ${link}, which is not an allowed / valid Link`));

      this.validatedQuery(_query.query, node);

      const res = await node
        .makeRequest<LavalinkResult>(`/loadtracks?identifier=${encodeURIComponent(_query.query)}`)
        .catch(err => reject(err));

      if (!res) return reject(new Error("Query not found."));

      const result: SearchResult = {
        loadType: res.loadType,
        exception: res.exception ?? null,
        tracks: res.tracks?.map((track: TrackData) =>
          TrackUtils.build(track, requester)
        ) ?? []
      };

      if (result.loadType === LoadTypes.PlaylistLoaded) {
        if (typeof res.playlistInfo === "object") {
          result.playlist = {
            ...result.playlist,
            name: res.playlistInfo.name,
            selectedTrack: res.playlistInfo.selectedTrack === -1 ? null :
              TrackUtils.build(
                res.tracks[res.playlistInfo.selectedTrack],
                requester
              ),
            duration: result.tracks
              .reduce((acc: number, cur: Track) => acc + (cur.duration || 0), 0)
          };
        }
      }

      return resolve(result);
    });
  }

  validatedQuery(queryString: string, node: Node): void {
    if (!node.info) return;
    if (!node.info.sourceManagers?.length) throw new Error("Lavalink Node, has no sourceManagers enabled");

    if (Manager.regex.AllSpotifyRegex.test(queryString) && !node.info.sourceManagers.includes("spotify"))
      throw new Error("Lavalink Node has not 'spotify' enabled");

    const hasSource = queryString.split(":")[0];
    if (queryString.split(" ").length <= 1 || !queryString.split(" ")[0].includes(":")) return;
    const source = Manager.DEFAULT_SOURCES[hasSource] as LavalinkSearchPlatform;
    if (!source) throw new Error(`Lavalink Node SearchQuerySource: '${hasSource}' is not available`);

    if (source === "speak" && !node.info.sourceManagers.includes("speak"))
      throw new Error("Lavalink Node has not 'speak' enabled, which is required to have 'speak' work");

    if (source === "tts" && !node.info.sourceManagers.includes("tts"))
      throw new Error("Lavalink Node has not 'tts' enabled, which is required to have 'tts' work");
  }

  public decodeTracks(tracks: string[]): Promise<TrackData[]> {
    return new Promise(async (resolve, reject) => {
      const node = this.nodes.first();
      if (!node) throw new Error("No available nodes.");

      const res = await node.makeRequest<TrackData[]>("/decodetracks", r => {
        r.method = "POST";
        r.body = JSON.stringify(tracks);
        r.headers!["Content-Type"] = "application/json";
      })
        .catch(err => reject(err));

      if (!res) return reject(new Error("No data returned from query."));

      return resolve(res);
    });
  }

  public async decodeTrack(encodedTrack: string): Promise<TrackData> {
    const res = await this.decodeTracks([encodedTrack]);
    return res[0];
  }

  public create(options: PlayerOptions): Player {
    if (this.players.has(options.guild))
      return this.players.get(options.guild);

    return new (Structure.get("Player"))(options);
  }

  public get(guild: string): Player | undefined {
    return this.players.get(guild);
  }

  public destroy(guild: string): void {
    this.players.delete(guild);
  }

  public createNode(options: NodeOptions): Node {
    if (this.nodes.has(options.identifier || options.host))
      return this.nodes.get(options.identifier || options.host);

    return new (Structure.get("Node"))(options);
  }

  public destroyNode(identifier: string): void {
    const node = this.nodes.get(identifier);
    if (!node) return;
    node.destroy();
    this.nodes.delete(identifier);
  }

  public async updateVoiceState(data: VoicePacket | VoiceServer | VoiceState): Promise<void> {
    if ("t" in data && !["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(data.t)) return;

    const update: VoiceServer | VoiceState = "d" in data ? data.d : data;
    if (!update || !("token" in update) && !("session_id" in update)) return;

    const player = this.players.get(update.guild_id) as Player;
    if (!player) return;

    if ("token" in update) {
      player.voiceState.event = update;
      if (!player.node?.sessionId) {
        if (REQUIRED_KEYS.every(key => key in player.voiceState)) await player.node.send(player.voiceState);
        return;
      }
      await player.node.updatePlayer({
        guildId: player.guild,
        playerOptions: {
          voice: {
            token: update.token,
            endpoint: update.endpoint,
            sessionId: player.voice?.sessionId || player.voiceState.sessionId
          }
        }
      });
      return;
    }

    if (update.user_id !== this.options.clientId) return;
    if (update.channel_id) {
      if (player.voiceChannel !== update.channel_id)
        this.emit("playerMove", player, player.voiceChannel, update.channel_id);
      if (player.voiceState) player.voiceState.sessionId = update.session_id;
      if (player.voice) player.voice.sessionId = update.session_id;
      player.voiceChannel = update.channel_id;
    } else {
      this.emit("playerDisconnect", player, player.voiceChannel);
      player.voiceChannel = null;
      player.voiceState = Object.assign({});
      player.voice = Object.assign({});
      await player.pause(true);
    }

    if (REQUIRED_KEYS.every(key => key in player.voiceState)) await player.node.send(player.voiceState);
  }
}

export interface Payload {
  op: number;
  d: {
    guild_id: string;
    channel_id: string | null;
    self_mute: boolean;
    self_deaf: boolean;
  };
}

export interface ManagerOptions {
  nodes?: NodeOptions[];
  clientId?: string;
  clientName?: string;
  shards?: number;
  autoPlay?: boolean;
  trackPartial?: string[];
  defaultSearchPlatform?: LavalinkSearchPlatform;
  volumeDecrementer?: number;
  position_update_interval?: number;
  validUnresolvedUris?: string[];
  allowedLinks?: string[];
  allowedLinksRegexes?: RegExp[];
  onlyAllowAllowedLinks?: boolean;
  forceSearchLinkQueries?: boolean;
  useUnresolvedData?: boolean;
  userAgent?: string;
  restTimeout?: number;
  applyVolumeAsFilter?: boolean;
  send(id: string, payload: Payload): void;
}

export type LavalinkSearchPlatform = "speak" | "tts";

export type SourcesRegex = "SpotifySongRegex" | "SpotifyPlaylistRegex" | "SpotifyArtistRegex" | "SpotifyEpisodeRegex" | "SpotifyShowRegex" | "SpotifyAlbumRegex" | "AllSpotifyRegex" | "mp3Url" | "m3uUrl" | "m3u8Url" | "mp4Url" | "m4aUrl" | "wavUrl";

export interface SearchQuery {
  source?: LavalinkSearchPlatform;
  query: string;
}

export interface SearchResult {
  loadType: LoadType;
  tracks: Track[];
  playlist?: PlaylistInfo;
  exception?: {
    message: string;
    severity: string;
  };
}

export interface PlaylistInfo {
  name: string;
  selectedTrack?: Track;
  duration: number;
}

export interface LavalinkResult {
  tracks: TrackData[];
  loadType: LoadType;
  exception?: {
    message: string;
    severity: string;
  };
  playlistInfo: {
    name: string;
    selectedTrack?: number;
  } | null;
}