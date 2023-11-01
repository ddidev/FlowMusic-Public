import { Manager, SearchQuery, SearchResult } from "./Manager";
import { Node } from "./Node";
import { Queue } from "./Queue";
import {
  LavalinkFilterData, LavalinkPlayerVoice, Sizes, State, Structure, TimescaleFilter, TrackUtils,
  VoiceState
} from "./Utils";

export type AudioOutputs = "mono" | "stereo" | "left" | "right";

export const validAudioOutputs = {
  mono: {
    leftToLeft: 0.5,
    leftToRight: 0.5,
    rightToLeft: 0.5,
    rightToRight: 0.5
  },
  stereo: {
    leftToLeft: 1,
    leftToRight: 0,
    rightToLeft: 0,
    rightToRight: 1
  },
  left: {
    leftToLeft: 0.5,
    leftToRight: 0,
    rightToLeft: 0.5,
    rightToRight: 0
  },
  right: {
    leftToLeft: 0,
    leftToRight: 0.5,
    rightToLeft: 0,
    rightToRight: 0.5
  }
};
function check(options: PlayerOptions) {
  if (!options) throw new TypeError("PlayerOptions must not be empty.");

  if (!/^\d+$/.test(options.guild))
    throw new TypeError(
      "Player option \"guild\" must be present and be a non-empty string."
    );

  if (options.textChannel && !/^\d+$/.test(options.textChannel))
    throw new TypeError(
      "Player option \"textChannel\" must be a non-empty string."
    );

  if (options.voiceChannel && !/^\d+$/.test(options.voiceChannel))
    throw new TypeError(
      "Player option \"voiceChannel\" must be a non-empty string."
    );

  if (options.node && typeof options.node !== "string")
    throw new TypeError("Player option \"node\" must be a non-empty string.");

  if (
    typeof options.volume !== "undefined" &&
    typeof options.volume !== "number"
  )
    throw new TypeError("Player option \"volume\" must be a number.");

  if (
    typeof options.selfMute !== "undefined" &&
    typeof options.selfMute !== "boolean"
  )
    throw new TypeError("Player option \"selfMute\" must be a boolean.");

  if (
    typeof options.selfDeafen !== "undefined" &&
    typeof options.selfDeafen !== "boolean"
  )
    throw new TypeError("Player option \"selfDeafen\" must be a boolean.");
}

export interface PlayerUpdatePayload {
  state: {
    connected: boolean,
    ping: number,
    position: number,
    time: number
  },
  guildId: string
}
export interface PlayerFilters {
  custom: boolean;
  nightcore: boolean;
  vaporwave: boolean;
  echo: boolean;
  rotation: boolean;
  karaoke: boolean;
  tremolo: boolean;
  vibrato: boolean;
  lowPass: boolean;
  audioOutput: AudioOutputs;
  volume: boolean;
}
export class Player {
  public readonly queue = new (Structure.get("Queue"))() as Queue;
  public trackRepeat = false;
  public queueRepeat = false;
  public position = 0;
  public playing = false;
  public paused = false;
  public volume: number;
  public node: Node;
  public guild: string;
  public voiceChannel: string | null = null;
  public textChannel: string | null = null;
  public state: State = "DISCONNECTED";
  public bands = new Array<number>(15).fill(0.0);
  public voiceState: VoiceState;
  public voice: LavalinkPlayerVoice;
  public manager: Manager;
  private static _manager: Manager;
  private readonly data: Record<string, unknown> = {};
  public filterUpdated: number;
  public createdAt: Date | null;
  public createdTimeStamp: number;
  public connected: boolean | undefined;
  public payload: Partial<PlayerUpdatePayload>;
  public region: string;
  public ping: number | undefined;
  public wsPing: number | null | undefined;
  public filters: PlayerFilters;
  public filterData: LavalinkFilterData;

  public set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  public get<T>(key: string): T {
    return this.data[key] as T;
  }

  public static init(manager: Manager): void {
    this._manager = manager;
  }

  constructor(public options: PlayerOptions) {
    if (!this.manager) this.manager = Structure.get("Player")._manager;
    if (!this.manager) throw new RangeError("Manager has not been initiated.");

    if (this.manager.players.has(options.guild))
      return this.manager.players.get(options.guild);

    check(options);

    this.createdAt = null;
    this.createdTimeStamp = 0;
    this.connected = undefined;
    this.payload = {};
    this.ping = undefined;
    this.wsPing = undefined;
    this.bands = new Array(15).fill(0.0);
    this.set("lastposition", undefined);

    this.guild = options.guild;
    this.voiceState = Object.assign({ op: "voiceUpdate", guildId: options.guild });

    if (options.voiceChannel) this.voiceChannel = options.voiceChannel;
    if (options.textChannel) this.textChannel = options.textChannel;
    if (typeof options.instaUpdateFiltersFix === "undefined") this.options.instaUpdateFiltersFix = true;

    if (!this.manager.leastUsedNodes?.size) {
      if (this.manager.initiated) this.manager.initiated = false;
      this.manager.init(this.manager.options?.clientId);
    }

    this.region = options.region;
    const customNode = this.manager.nodes.get(options.node),
      regionNode = this.manager.leastUsedNodes.filter(x => x.regions?.includes(options.region?.toLowerCase()))?.first();
    this.node = customNode || regionNode || this.manager.leastUsedNodes.first();

    if (!this.node) throw new RangeError("No available nodes.");

    this.filters = {
      volume: false,
      vaporwave: false,
      custom: false,
      nightcore: false,
      echo: false,
      rotation: false,
      karaoke: false,
      tremolo: false,
      vibrato: false,
      lowPass: false,
      audioOutput: "stereo"
    };
    this.filterData = {
      lowPass: {
        smoothing: 0
      },
      karaoke: {
        level: 0,
        monoLevel: 0,
        filterBand: 0,
        filterWidth: 0
      },
      timescale: {
        speed: 1,
        pitch: 1,
        rate: 1
      },
      echo: {
        delay: 0,
        decay: 0
      },
      rotation: {
        rotationHz: 0
      },
      tremolo: {
        frequency: 2,
        depth: 0.1
      },
      vibrato: {
        frequency: 2,
        depth: 0.1
      },
      channelMix: validAudioOutputs.stereo
    };

    this.manager.players.set(options.guild, this);
    this.manager.emit("playerCreate", this);
    this.setVolume(options.volume ?? 100);
  }
  checkFiltersState(oldFilterTimescale?: Partial<TimescaleFilter>) {
    this.filters.rotation = this.filterData.rotation.rotationHz !== 0;
    this.filters.vibrato = this.filterData.vibrato.frequency !== 0 || this.filterData.vibrato.depth !== 0;
    this.filters.tremolo = this.filterData.tremolo.frequency !== 0 || this.filterData.tremolo.depth !== 0;
    this.filters.echo = this.filterData.echo.decay !== 0 || this.filterData.echo.delay !== 0;
    this.filters.lowPass = this.filterData.lowPass.smoothing !== 0;
    this.filters.karaoke = Object.values(this.filterData.karaoke).some(v => v !== 0);
    if ((this.filters.nightcore || this.filters.vaporwave) && oldFilterTimescale)
      if (oldFilterTimescale.pitch !== this.filterData.timescale.pitch || oldFilterTimescale.rate !== this.filterData.timescale.rate || oldFilterTimescale.speed !== this.filterData.timescale.speed) {
        this.filters.custom = Object.values(this.filterData.timescale).some(v => v !== 1);
        this.filters.nightcore = false;
        this.filters.vaporwave = false;
      }
    return true;
  }

  public async resetFilters(): Promise<PlayerFilters> {
    this.filters.echo = false;
    this.filters.nightcore = false;
    this.filters.lowPass = false;
    this.filters.rotation = false;
    this.filters.tremolo = false;
    this.filters.vibrato = false;
    this.filters.karaoke = false;
    this.filters.karaoke = false;
    this.filters.volume = false;
    this.filters.audioOutput = "stereo";

    for (const [key, value] of Object.entries({
      volume: 1,
      lowPass: {
        smoothing: 0
      },
      karaoke: {
        level: 0,
        monoLevel: 0,
        filterBand: 0,
        filterWidth: 0
      },
      timescale: {
        speed: 1,
        pitch: 1,
        rate: 1
      },
      echo: {
        delay: 0,
        decay: 0
      },
      rotation: {
        rotationHz: 0
      },
      tremolo: {
        frequency: 2,
        depth: 0.1
      },
      vibrato: {
        frequency: 2,
        depth: 0.1
      },
      channelMix: validAudioOutputs.stereo
    })) {
      this.filterData[key] = value;
    }
    await this.updatePlayerFilters();
    return this.filters;
  }

  public async setAudioOutput(type: AudioOutputs): Promise<AudioOutputs> {
    if (this.node.info && !this.node.info.filters?.includes("channelMix")) throw new Error("Node#Info#filters does not include the 'channelMix' Filter (Node has it not enable)");
    if (!type || !validAudioOutputs[type]) throw new Error("Invalid audio type added, must be 'mono' / 'stereo' / 'left' / 'right'");
    this.filterData.channelMix = validAudioOutputs[type];
    this.filters.audioOutput = type;
    await this.updatePlayerFilters();
    return this.filters.audioOutput;
  }

  public async setSpeed(speed = 1): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("timescale")) throw new Error("Node#Info#filters does not include the 'timescale' Filter (Node has it not enable)");
    if (this.filters.nightcore || this.filters.vaporwave) {
      this.filterData.timescale.pitch = 1;
      this.filterData.timescale.speed = 1;
      this.filterData.timescale.rate = 1;
      this.filters.nightcore = false;
      this.filters.vaporwave = false;
    }

    this.filterData.timescale.speed = speed;

    this.isCustomFilterActive();

    await this.updatePlayerFilters();
    return this.filters.custom;
  }

  public async setPitch(pitch = 1): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("timescale")) throw new Error("Node#Info#filters does not include the 'timescale' Filter (Node has it not enable)");
    if (this.filters.nightcore || this.filters.vaporwave) {
      this.filterData.timescale.pitch = 1;
      this.filterData.timescale.speed = 1;
      this.filterData.timescale.rate = 1;
      this.filters.nightcore = false;
      this.filters.vaporwave = false;
    }

    this.filterData.timescale.pitch = pitch;
    this.isCustomFilterActive();

    await this.updatePlayerFilters();
    return this.filters.custom;
  }

  public async setRate(rate = 1): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("timescale")) throw new Error("Node#Info#filters does not include the 'timescale' Filter (Node has it not enable)");
    if (this.filters.nightcore || this.filters.vaporwave) {
      this.filterData.timescale.pitch = 1;
      this.filterData.timescale.speed = 1;
      this.filterData.timescale.rate = 1;
      this.filters.nightcore = false;
      this.filters.vaporwave = false;
    }

    this.filterData.timescale.rate = rate;

    this.isCustomFilterActive();
    await this.updatePlayerFilters();
    return this.filters.custom;
  }

  public async toggleVibrato(frequency = 2, depth = 0.5): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("vibrato")) throw new Error("Node#Info#filters does not include the 'vibrato' Filter (Node has it not enable)");
    this.filterData.vibrato.frequency = this.filters.vibrato ? 0 : frequency;
    this.filterData.vibrato.depth = this.filters.vibrato ? 0 : depth;

    this.filters.vibrato = !this.filters.vibrato;
    await this.updatePlayerFilters();
    return this.filters.vibrato;
  }

  public async toggleTremolo(frequency = 2, depth = 0.5): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("tremolo")) throw new Error("Node#Info#filters does not include the 'tremolo' Filter (Node has it not enable)");
    this.filterData.tremolo.frequency = this.filters.tremolo ? 0 : frequency;
    this.filterData.tremolo.depth = this.filters.tremolo ? 0 : depth;

    this.filters.tremolo = !this.filters.tremolo;
    await this.updatePlayerFilters();
    return this.filters.tremolo;
  }

  public async toggleLowPass(smoothing = 20): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("lowPass")) throw new Error("Node#Info#filters does not include the 'lowPass' Filter (Node has it not enable)");
    this.filterData.lowPass.smoothing = this.filters.lowPass ? 0 : smoothing;

    this.filters.lowPass = !this.filters.lowPass;
    await this.updatePlayerFilters();
    return this.filters.lowPass;
  }

  public async toggleEcho(delay = 1, decay = 0.5): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("echo")) throw new Error("Node#Info#filters does not include the 'echo' Filter (Node has it not enable aka not installed!)");
    this.filterData.echo.delay = this.filters.echo ? 0 : delay;
    this.filterData.echo.decay = this.filters.echo ? 0 : decay;

    this.filters.echo = !this.filters.echo;
    await this.updatePlayerFilters();
    return this.filters.echo;
  }

  public async toggleNightcore(speed = 1.289999523162842, pitch = 1.289999523162842, rate = 0.9365999523162842): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("timescale")) throw new Error("Node#Info#filters does not include the 'timescale' Filter (Node has it not enable)");
    this.filterData.timescale.speed = this.filters.nightcore ? 1 : speed;
    this.filterData.timescale.pitch = this.filters.nightcore ? 1 : pitch;
    this.filterData.timescale.rate = this.filters.nightcore ? 1 : rate;

    this.filters.nightcore = !this.filters.nightcore;
    this.filters.vaporwave = false;
    this.filters.custom = false;
    await this.updatePlayerFilters();
    return this.filters.nightcore;
  }

  public async toggleVaporwave(speed = 0.8500000238418579, pitch = 0.800000011920929, rate = 1): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("timescale")) throw new Error("Node#Info#filters does not include the 'timescale' Filter (Node has it not enable)");
    this.filterData.timescale.speed = this.filters.vaporwave ? 1 : speed;
    this.filterData.timescale.pitch = this.filters.vaporwave ? 1 : pitch;
    this.filterData.timescale.rate = this.filters.vaporwave ? 1 : rate;

    this.filters.vaporwave = !this.filters.vaporwave;
    this.filters.nightcore = false;
    this.filters.custom = false;
    await this.updatePlayerFilters();
    return this.filters.vaporwave;
  }

  public async toggleKaraoke(level = 1, monoLevel = 1, filterBand = 220, filterWidth = 100): Promise<boolean> {
    if (this.node.info && !this.node.info.filters?.includes("karaoke")) throw new Error("Node#Info#filters does not include the 'karaoke' Filter (Node has it not enable)");

    this.filterData.karaoke.level = this.filters.karaoke ? 0 : level;
    this.filterData.karaoke.monoLevel = this.filters.karaoke ? 0 : monoLevel;
    this.filterData.karaoke.filterBand = this.filters.karaoke ? 0 : filterBand;
    this.filterData.karaoke.filterWidth = this.filters.karaoke ? 0 : filterWidth;

    this.filters.karaoke = !this.filters.karaoke;
    await this.updatePlayerFilters();
    return this.filters.karaoke;
  }

  public isCustomFilterActive(): boolean {
    this.filters.custom = !this.filters.nightcore && !this.filters.vaporwave && Object.values(this.filterData.timescale).some(d => d !== 1);
    return this.filters.custom;
  }

  async updatePlayerFilters(): Promise<Player> {
    const sendData = { ...this.filterData };

    if (!this.filters.volume) delete sendData.volume;
    if (!this.filters.tremolo) delete sendData.tremolo;
    if (!this.filters.vibrato) delete sendData.vibrato;
    if (!this.filters.echo) delete sendData.echo;
    if (!this.filters.lowPass) delete sendData.lowPass;
    if (!this.filters.karaoke) delete sendData.karaoke;
    if (this.filters.audioOutput === "stereo") delete sendData.channelMix;
    const now = Date.now();
    if (!this.node.sessionId) {
      console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");

      await this.node.send({
        op: "filters",
        guildId: this.guild,
        equalizer: this.bands.map((gain, band) => ({ band, gain })),
        ...sendData
      });
    } else {
      sendData.equalizer = this.bands.map((gain, band) => ({ band, gain }));
      for (const key of [...Object.keys(sendData)])
        if (this.node.info && !this.node.info.filters?.includes?.(key)) delete sendData[key];

      await this.node.updatePlayer({
        guildId: this.guild,
        playerOptions: {
          filters: sendData
        }
      });
    }
    this.ping = Date.now() - now;
    if (this.options.instaUpdateFiltersFix === true) this.filterUpdated = 1;
    return this;
  }

  public search(
    query: string | SearchQuery,
    requester?: unknown
  ): Promise<SearchResult> {
    return this.manager.search(query, requester, this.node);
  }

  public async setEQ(...bands: EqualizerBand[]): Promise<this> {
    if (Array.isArray(bands[0])) bands = bands[0] as unknown as EqualizerBand[];

    if (!bands.length || !bands.every((band) => JSON.stringify(Object.keys(band).sort()) === "[\"band\",\"gain\"]"))
      throw new TypeError("Bands must be a non-empty object array containing 'band' and 'gain' properties.");

    for (const { band, gain } of bands) this.bands[band] = gain;
    if (!this.node.sessionId) {
      console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");
      await this.node.send({
        op: "filters",
        guildId: this.guild,
        equalizer: this.bands.map((gain, band) => ({ band, gain }))
      });
    } else {
      await this.node.updatePlayer({
        guildId: this.guild,
        playerOptions: {
          filters: { equalizer: this.bands.map((gain, band) => ({ band, gain })) }
        }
      });
    }
    return this;
  }

  public async clearEQ(): Promise<this> {
    this.bands = new Array(15).fill(0.0);
    if (!this.node.sessionId) {
      console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");
      await this.node.send({
        op: "filters",
        guildId: this.guild,
        equalizer: this.bands.map((gain, band) => ({ band, gain }))
      });
    } else {
      await this.node.updatePlayer({
        guildId: this.guild,
        playerOptions: {
          filters: { equalizer: this.bands.map((gain, band) => ({ band, gain })) }
        }
      });
    }
    return this;
  }

  public connect(): this {
    if (!this.voiceChannel)
      throw new RangeError("No voice channel has been set.");
    this.state = "CONNECTING";

    this.manager.options.send(this.guild, {
      op: 4,
      d: {
        guild_id: this.guild,
        channel_id: this.voiceChannel,
        self_mute: this.options.selfMute || false,
        self_deaf: this.options.selfDeafen || false
      }
    });

    this.state = "CONNECTED";
    return this;
  }

  public disconnect(): this {
    if (this.voiceChannel === null) return this;
    this.state = "DISCONNECTING";

    this.pause(true);
    this.manager.options.send(this.guild, {
      op: 4,
      d: {
        guild_id: this.guild,
        channel_id: null,
        self_mute: false,
        self_deaf: false
      }
    });

    this.voiceChannel = null;
    this.state = "DISCONNECTED";
    return this;
  }

  public async destroy(disconnect = true): Promise<void> {
    this.state = "DESTROYING";
    if (disconnect) {
      this.disconnect();
    }

    await this.node.destroyPlayer(this.guild);

    this.manager.emit("playerDestroy", this);
    this.manager.players.delete(this.guild);
  }

  public setVoiceChannel(channel: string): this {
    if (typeof channel !== "string")
      throw new TypeError("Channel must be a non-empty string.");

    this.voiceChannel = channel;
    this.connect();
    return this;
  }

  public setTextChannel(channel: string): this {
    if (typeof channel !== "string")
      throw new TypeError("Channel must be a non-empty string.");

    this.textChannel = channel;
    return this;
  }

  public async play(): Promise<void>;
  public async play(track: Track | UnresolvedTrack): Promise<void>;
  public async play(options: PlayOptions): Promise<void>;
  public async play(track: Track | UnresolvedTrack, options: PlayOptions): Promise<void>;
  public async play(
    optionsOrTrack?: PlayOptions | Track | UnresolvedTrack,
    playOptions?: PlayOptions
  ): Promise<void> {
    if (
      typeof optionsOrTrack !== "undefined" &&
      TrackUtils.validate(optionsOrTrack)
    ) {
      if (this.queue.current) this.queue.previous = this.queue.current;
      this.queue.current = optionsOrTrack as Track;
    }

    if (!this.queue.current) throw new RangeError("No current track.");

    const finalOptions = getOptions(playOptions || optionsOrTrack, !!this.node.sessionId) ? (optionsOrTrack as PlayOptions) : {};

    if (TrackUtils.isUnresolvedTrack(this.queue.current)) {
      try {
        this.queue.current = await TrackUtils.getClosestTrack(this.queue.current as UnresolvedTrack);
      } catch (error) {
        this.manager.emit("trackError", this, this.queue.current, error);
        if (this.queue[0]) return this.play(this.queue[0]);
        return;
      }
    }

    const options = {
      guildId: this.guild,
      encodedTrack: this.queue.current.track,
      ...finalOptions
    };

    if (typeof options.encodedTrack !== "string")
      options.encodedTrack = (options.encodedTrack as Track).track;

    this.set("lastposition", this.position);

    const now = Date.now();
    if (!this.node.sessionId) {
      await this.node.send({
        track: options.encodedTrack,
        op: "play",
        guildId: this.guild,
        ...finalOptions
      });
    } else {
      await this.node.updatePlayer({
        guildId: this.guild,
        noReplace: finalOptions.noReplace ?? false,
        playerOptions: options
      });
    }
    this.ping = Date.now() - now;
    return;
  }

  public async setVolume(volume: number): Promise<this> {
    volume = Number(volume);

    if (isNaN(volume)) throw new TypeError("Volume must be a number.");
    this.volume = Math.max(Math.min(volume, 500), 0);

    let vol = this.volume;
    if (this.manager.options.volumeDecrementer) vol *= this.manager.options.volumeDecrementer;

    const now = Date.now();
    if (!this.node.sessionId) {
      console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");
      await this.node.send({
        op: "volume",
        guildId: this.guild,
        volume: vol
      });
    } else {
      if (this.manager.options.applyVolumeAsFilter) {
        await this.node.updatePlayer({
          guildId: this.guild,
          playerOptions: {
            filters: { volume: vol / 100 }
          }
        });
      } else {
        await this.node.updatePlayer({
          guildId: this.guild,
          playerOptions: {
            volume: vol
          }
        });
      }
    }
    this.ping = Date.now() - now;
    return this;
  }

  public async setVolumeFilter(volume: number): Promise<this> {
    if (!this.node.sessionId) throw new Error("The Lavalink-Node is either not ready, or not up to date! (REST Api must be useable)");
    volume = Number(volume);

    if (isNaN(volume)) throw new TypeError("Volume must be a number.");
    this.filterData.volume = Math.max(Math.min(volume, 5), 0);
    this.filters.volume = this.filterData.volume === 1 ? false : true;

    const now = Date.now();
    await this.node.updatePlayer({
      guildId: this.guild,
      playerOptions: {
        filters: { volume: this.filterData.volume }
      }
    });
    this.ping = Date.now() - now;
    return this;
  }

  public setTrackRepeat(repeat: boolean): this {
    if (typeof repeat !== "boolean")
      throw new TypeError("Repeat can only be \"true\" or \"false\".");

    if (repeat) {
      this.trackRepeat = true;
      this.queueRepeat = false;
    } else {
      this.trackRepeat = false;
      this.queueRepeat = false;
    }

    return this;
  }

  public setQueueRepeat(repeat: boolean): this {
    if (typeof repeat !== "boolean")
      throw new TypeError("Repeat can only be \"true\" or \"false\".");

    if (repeat) {
      this.trackRepeat = false;
      this.queueRepeat = true;
    } else {
      this.trackRepeat = false;
      this.queueRepeat = false;
    }

    return this;
  }

  public async stop(amount?: number): Promise<this> {
    if (typeof amount === "number" && amount > 1) {
      if (amount > this.queue.length) throw new RangeError("Cannot skip more than the queue length.");
      this.queue.splice(0, amount - 1);
    }

    const now = Date.now();
    if (!this.node.sessionId) {
      console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");
      await this.node.send({
        op: "stop",
        guildId: this.guild
      });
    } else {
      await this.node.updatePlayer({
        guildId: this.guild,
        playerOptions: { encodedTrack: null }
      });
    }
    this.ping = Date.now() - now;

    return this;
  }

  public async pause(paused: boolean): Promise<this> {
    if (typeof paused !== "boolean")
      throw new RangeError("Pause can only be \"true\" or \"false\".");

    if (this.paused === paused || !this.queue.totalSize) return this;

    this.playing = !paused;
    this.paused = paused;

    const now = Date.now();

    if (!this.node.sessionId) {
      console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");
      await this.node.send({
        op: "pause",
        guildId: this.guild,
        pause: paused
      });
    } else {
      await this.node.updatePlayer({
        guildId: this.guild,
        playerOptions: { paused }
      });
    }

    this.ping = Date.now() - now;

    return this;
  }

  public async seek(position: number): Promise<this> {
    if (!this.queue.current) return undefined;
    position = Number(position);

    if (isNaN(position)) {
      throw new RangeError("Position must be a number.");
    }
    if (position < 0 || position > this.queue.current.duration)
      position = Math.max(Math.min(position, this.queue.current.duration), 0);

    this.position = position;
    this.set("lastposition", this.position);

    const now = Date.now();

    if (!this.node.sessionId) {
      console.warn("@deprecated - The Lavalink-Node is either not up to date (or not ready)! -- Using WEBSOCKET instead of REST");
      await this.node.send({
        op: "seek",
        guildId: this.guild,
        position
      });
    } else {
      await this.node.updatePlayer({
        guildId: this.guild,
        playerOptions: { position }
      });
    }
    this.ping = Date.now() - now;
    return this;
  }
}

export interface PlayerOptions {
  guild: string;
  textChannel: string;
  voiceChannel?: string;
  node?: string;
  volume?: number;
  selfMute?: boolean;
  selfDeafen?: boolean;
  region?: string;
  instaUpdateFiltersFix: boolean;
}

export interface Track {
  readonly track: string;
  readonly encodedTrack: string;
  title: string;
  identifier: string;
  author: string;
  duration: number;
  isSeekable: boolean;
  isStream: boolean;
  uri: string;
  thumbnail: string | null;
  requester: unknown | null;
  displayThumbnail(size?: Sizes): string;
  isPreview: boolean;
  artworkURL: string | null;
  isrc: string | null;

}

export interface UnresolvedTrack extends Partial<Track> {
  title: string;
  author?: string;
  duration?: number;
  thumbnail?: string;
  artworkURL: string | null;
  identifier?: string;
  resolve(): Promise<void>;
}

export interface PlayOptions {
  readonly startTime?: number;
  readonly endTime?: number;
  readonly noReplace?: boolean;
  readonly pause?: boolean;
  readonly volume?: number;
  readonly filters?: LavalinkFilterData;
}

export interface EqualizerBand {
  band: number;
  gain: number;
}

function getOptions(opts?: any, allowFilters?: boolean): Partial<PlayOptions> | false {
  const valids = ["startTime", "endTime", "noReplace", "volume", "pause", "filters"],
    returnObject = {} as PlayOptions;
  if (!opts) return false;
  for (const [key, value] of Object.entries(Object.assign({}, opts)))
    if (valids.includes(key) && (key !== "filters" || (key === "filters" && allowFilters)))
      returnObject[key] = value;

  return returnObject as PlayOptions;
}