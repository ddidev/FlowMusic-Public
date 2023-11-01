import EventEmitter from "events";
import fs from "fs";
import ms from "ms";
import os from "os";
import path from "path";

import logger from "../../Shared/structures/Logger";
import { HeartbeatManager } from "../Plugins/HeartbeatSystem";
import { ChildProcessOptions } from "../Structures/Child";
import { BaseMessage } from "../Structures/IPCMessage";
import { ClusterManagerHooks } from "../Structures/ManagerHooks";
import { PromiseHandler } from "../Structures/PromiseHandler";
import { Queue } from "../Structures/Queue";
import {
  Awaitable, ClusterManagerEvents, ClusterManagerOptions, ClusterManagerSpawnOptions,
  ClusterRestartOptions, DjsDiscordClient, evalOptions, Plugin, QueueOptions, Serialized
} from "../types/shared";
import {
  chunkArray, delayFor, fetchGatewayInformation, makePlainError, shardIdForGuildId
} from "../Util/Util";
import { Cluster } from "./Cluster";

export class ClusterManager extends EventEmitter {
  respawn: boolean;
  restarts: ClusterRestartOptions;
  clusterData: object;
  clusterOptions: ChildProcessOptions | {};
  file: string;
  totalShards: number;
  totalClusters: number;
  shardsPerClusters: number | undefined;
  shardArgs: string[];
  execArgv: string[];
  shardList: number[];
  token: string | null;
  clusters: Map<number, Cluster>;
  shardClusterList: number[][];
  clusterList: number[];
  spawnOptions: ClusterManagerSpawnOptions;
  queue: Queue;
  promise: PromiseHandler;
  heartbeat?: HeartbeatManager;
  hooks: ClusterManagerHooks;
  logger: logger;

  constructor(file: string, options: ClusterManagerOptions) {
    super();
    if (!options) options = {};

    this.respawn = options.respawn ?? true;
    this.restarts = options.restarts || { max: 3, interval: 60000 * 60, current: 0 };
    this.clusterData = options.clusterData || {};
    this.clusterOptions = options.clusterOptions || {};
    this.file = file;

    if (!file) throw new Error("CLIENT_INVALID_OPTION | No File specified.");
    if (!path.isAbsolute(file)) this.file = path.resolve(process.cwd(), file);

    const stats = fs.statSync(this.file);
    if (!stats.isFile()) throw new Error("CLIENT_INVALID_OPTION | Provided is file is not type of file");

    this.totalShards = options.totalShards === "auto" ? -1 : options.totalShards ?? -1;
    if (this.totalShards !== -1) {
      if (typeof this.totalShards !== "number" || isNaN(this.totalShards))
        throw new TypeError("CLIENT_INVALID_OPTION | Amount of internal shards must be a number.");
      if (this.totalShards < 1)
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of internal shards must be at least 1.");
      if (!Number.isInteger(this.totalShards))
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of internal shards must be an integer.");
    }

    this.totalClusters = options.totalClusters === "auto" ? -1 : options.totalClusters ?? -1;
    if (this.totalClusters !== -1) {
      if (typeof this.totalClusters !== "number" || isNaN(this.totalClusters))
        throw new TypeError("CLIENT_INVALID_OPTION | Amount of Clusters must be a number.");
      if (this.totalClusters < 1)
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of Clusters must be at least 1.");
      if (!Number.isInteger(this.totalClusters))
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of Clusters must be an integer.");
    }

    this.shardsPerClusters = options.shardsPerClusters;
    if (this.shardsPerClusters) {
      if (typeof this.shardsPerClusters !== "number" || isNaN(this.shardsPerClusters))
        throw new TypeError("CLIENT_INVALID_OPTION | Amount of ShardsPerClusters must be a number.");
      if (this.shardsPerClusters < 1)
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of shardsPerClusters must be at least 1.");
      if (!Number.isInteger(this.shardsPerClusters))
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of Shards Per Clusters must be an integer.");
    }

    this.shardArgs = options.shardArgs ?? [];

    this.execArgv = options.execArgv ?? [];

    this.shardList = options.shardList ?? [];
    if (this.shardList.length) {
      if (!Array.isArray(this.shardList))
        throw new TypeError("CLIENT_INVALID_OPTION | shardList must be an array.");

      this.shardList = Array.from(new Set(this.shardList));

      if (this.shardList.length < 1)
        throw new RangeError("CLIENT_INVALID_OPTION | shardList must contain at least 1 ID.");

      if (
        this.shardList.some(
          shardID => typeof shardID !== "number" || isNaN(shardID) || !Number.isInteger(shardID) || shardID < 0
        )
      ) throw new TypeError("CLIENT_INVALID_OPTION | shardList has to contain an array of positive integers.");
    }

    if (!options.token) options.token = process.env.DISCORD_TOKEN;

    this.token = options.token ? options.token.replace(/^Bot\s*/i, "") : null;

    this.clusters = new Map();
    this.shardClusterList = [];

    process.env.SHARD_LIST = undefined;
    process.env.TOTAL_SHARDS = this.totalShards as any;
    process.env.CLUSTER = undefined;
    process.env.CLUSTER_COUNT = this.totalClusters as any;
    process.env.CLUSTER_MANAGER = "true";
    process.env.DISCORD_TOKEN = String(this.token);
    process.env.MAINTENANCE = undefined;

    if (options.queue?.auto) process.env.CLUSTER_QUEUE_MODE = "auto";
    else process.env.CLUSTER_QUEUE_MODE = "manual";

    this.clusterList = options.clusterList || [];

    this.spawnOptions = options.spawnOptions || { delay: 7000, timeout: -1 };
    if (!this.spawnOptions.delay) this.spawnOptions.delay = 7000;

    if (!options.queue) options.queue = { auto: true };
    if (!options.queue.timeout) options.queue.timeout = this.spawnOptions.delay;
    this.queue = new Queue(options.queue as Required<QueueOptions>);

    this._debug("[START] Cluster Manager has been initialized");

    this.promise = new PromiseHandler();

    this.hooks = new ClusterManagerHooks();

    this.logger = options.logger;
  }

  public async spawn({ amount = this.totalShards, delay = 7000, timeout = -1 } = this.spawnOptions) {
    if (amount === -1 || amount === "auto") {
      if (!this.token) throw new Error("A Token must be provided, when totalShards is set on auto.");

      const { shards, session_start_limit } = await fetchGatewayInformation(this.token, 1000);
      this.totalShards = shards as number;
      amount = shards;

      this.logger?.log("gateway", `There are ${session_start_limit.remaining} session starts left before a token reset.`);
      this.logger?.log("gateway", `Session limit reset in ${ms(session_start_limit.reset_after, { long: true })}.`);
      this.logger?.log("gateway", `Max concurrency is currently ${session_start_limit.max_concurrency}.`);
      this.logger?.log("gateway", `Using recommended shard count of ${shards}`);

    } else {
      if (typeof amount !== "number" || isNaN(amount))
        throw new TypeError("CLIENT_INVALID_OPTION | Amount of Internal Shards must be a number.");
      if (amount < 1)
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of Internal Shards must be at least 1.");
      if (!Number.isInteger(amount))
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of Internal Shards must be an integer.");
    }

    let clusterAmount = this.totalClusters;
    if (clusterAmount === -1) {
      clusterAmount = os.cpus().length;
      this.totalClusters = clusterAmount;
    } else {
      if (typeof clusterAmount !== "number" || isNaN(clusterAmount))
        throw new TypeError("CLIENT_INVALID_OPTION | Amount of Clusters must be a number.");
      if (clusterAmount < 1)
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of Clusters must be at least 1.");
      if (!Number.isInteger(clusterAmount))
        throw new RangeError("CLIENT_INVALID_OPTION | Amount of Clusters must be an integer.");
    }

    if (!this.shardList.length) this.shardList = Array.from(Array(amount).keys());

    if (this.shardsPerClusters) this.totalClusters = Math.ceil(this.shardList.length / this.shardsPerClusters);

    this.shardClusterList = chunkArray(
      this.shardList,
      (!isNaN(this.shardsPerClusters as any) ? this.shardsPerClusters as number : Math.ceil(this.shardList.length / (this.totalClusters as number)))
    );

    if (this.shardClusterList.length !== this.totalClusters)
      this.totalClusters = this.shardClusterList.length;

    this._debug(`[Spawning Clusters]
    ClusterCount: ${this.totalClusters}
    ShardCount: ${amount}
    ShardList: ${this.shardClusterList.join(", ")}`);

    for (let i = 0; i < this.totalClusters; i++) {
      const clusterId = this.clusterList[i] || i;
      if (this.shardClusterList[i]) {
        const length = this.shardClusterList[i]?.length as number,
          readyTimeout = timeout !== -1 ? timeout + delay * length : timeout,
          spawnDelay = delay * length;
        this.queue.add({
          run: (...a) => {
            const cluster = this.createCluster(
              clusterId,
              this.shardClusterList[i] as number[],
              this.totalShards
            );
            return cluster.spawn(...a);
          },
          args: [readyTimeout],
          timeout: spawnDelay
        });
      }
    }
    return this.queue.start();
  }

  public broadcast(message: BaseMessage) {
    const promises = [];
    for (const cluster of Array.from(this.clusters.values())) promises.push(cluster.send(message));
    return Promise.all(promises);
  }

  public createCluster(id: number, shardsToSpawn: number[], totalShards: number, recluster = false) {
    const cluster = new Cluster(this, id, shardsToSpawn, totalShards);
    if (!recluster) this.clusters.set(id, cluster);

    this.emit("clusterCreate", cluster);

    this._debug(`[CREATE] Created Cluster ${cluster.id}`);
    return cluster;
  }

  public broadcastEval(script: string): Promise<any[]>;
  public broadcastEval(script: string, options?: evalOptions): Promise<any>;
  public broadcastEval<T>(fn: (client: DjsDiscordClient) => Awaitable<T>): Promise<Serialized<T>[]>;
  public broadcastEval<T>(
    fn: (client: DjsDiscordClient) => Awaitable<T>,
    options?: { cluster?: number; timeout?: number },
  ): Promise<Serialized<T>>;
  public broadcastEval<T, P>(
    fn: (client: DjsDiscordClient, context: Serialized<P>) => Awaitable<T>,
    options?: evalOptions<P>,
  ): Promise<Serialized<T>[]>;
  public broadcastEval<T, P>(
    fn: (client: DjsDiscordClient, context: Serialized<P>) => Awaitable<T>,
    options?: evalOptions<P>,
  ): Promise<Serialized<T>>;
  public async broadcastEval<T, P>(
    script:
      | string
      | ((client: DjsDiscordClient, context?: Serialized<P>) => Awaitable<T> | Promise<Serialized<T>>),
    evalOptions?: evalOptions | evalOptions<P>
  ) {
    const options = evalOptions ?? {};
    if (!script)
      return Promise.reject(new TypeError("ClUSTERING_INVALID_EVAL_BROADCAST"));
    script = typeof script === "function" ? `(${script})(this, ${JSON.stringify(options.context)})` : script;

    if (Object.prototype.hasOwnProperty.call(options, "cluster")) {
      if (typeof options.cluster === "number")
        if (options.cluster < 0) throw new RangeError("CLUSTER_ID_OUT_OF_RANGE");

      if (Array.isArray(options.cluster))
        if (options.cluster.length === 0) throw new RangeError("ARRAY_MUST_CONTAIN_ONE CLUSTER_ID");
    }
    if (options.guildId)
      options.shard = shardIdForGuildId(options.guildId, this.totalShards);

    if (options.shard) {
      if (typeof options.shard === "number")
        if (options.shard < 0) throw new RangeError("SHARD_ID_OUT_OF_RANGE");

      if (Array.isArray(options.shard))
        if (options.shard.length === 0) throw new RangeError("ARRAY_MUST_CONTAIN_ONE SHARD_ID");

      options.cluster = Array.from(this.clusters.values()).find(c =>
        c.shardList.includes(options.shard as number)
      )?.id;
    }
    return this._performOnClusters("eval", [script], options.cluster, options.timeout);
  }

  public fetchClientValues(prop: string, cluster?: number) {
    return this.broadcastEval(`this.${prop}`, { cluster });
  }

  private _performOnClusters(method: "eval", args: any[], cluster?: number | number[], timeout?: number) {
    if (this.clusters.size === 0) return Promise.reject(new Error("CLUSTERING_NO_CLUSTERS"));

    if (typeof cluster === "number") {
      if (this.clusters.has(cluster))
        return (
          this.clusters
            .get(cluster)
            // @ts-expect-error
            ?.[method](...args, undefined, timeout)
            .then((e: any) => [e])
        );
      return Promise.reject(new Error("CLUSTERING_CLUSTER_NOT_FOUND FOR ClusterId: " + cluster));
    }
    let clusters = Array.from(this.clusters.values());
    if (cluster) clusters = clusters.filter(c => cluster.includes(c.id));
    if (clusters.length === 0) return Promise.reject(new Error("CLUSTERING_NO_CLUSTERS_FOUND"));

    const promises = [];

    // @ts-expect-error
    for (const cl of clusters) promises.push(cl[method](...args, undefined, timeout));
    return Promise.all(promises);
  }

  public async respawnAll({ clusterDelay = 5500, respawnDelay = 500, timeout = -1 } = {}) {
    this.promise.nonce.clear();
    let s = 0,
      i = 0;
    for (const cluster of Array.from(this.clusters.values())) {
      const promises: any[] = [cluster.respawn({ delay: respawnDelay, timeout })],
        length = this.shardClusterList[i]?.length || this.totalShards / this.totalClusters;
      if (++s < this.clusters.size && clusterDelay > 0) promises.push(delayFor(length * clusterDelay));
      i++;
      await Promise.all(promises);
    }
    this._debug("Respawning all Clusters");
    return this.clusters;
  }

  public async evalOnManager(script: Function | string) {
    script = typeof script === "function" ? `(${script})(this)` : script;
    let result,
      error;
    try {
      result = await eval(script);
    } catch (err) {
      error = err;
    }
    return { _result: result, _error: error ? makePlainError(error) : null };
  }

  public evalOnCluster(script: string, options: evalOptions) {
    return this.broadcastEval(script, options).then((r: any[]) => r[0]);
  }

  public extend(...plugins: Plugin[]) {
    if (!plugins.length) throw new Error("NO_PLUGINS_PROVIDED");
    for (const plugin of plugins) {
      if (!plugin) throw new Error("PLUGIN_NOT_PROVIDED");
      if (typeof plugin !== "object") throw new Error("PLUGIN_NOT_A_OBJECT");
      plugin.build(this);
    }
  }

  triggerMaintenance(reason: string) {
    return Array.from(this.clusters.values()).forEach(cluster => cluster.triggerMaintenance(reason));
  }

  public _debug(message: string, cluster?: number) {
    let log;
    if (cluster === undefined) log = "[CM => Manager] " + message;
    else log = `[CM => Cluster ${cluster}] ` + message;

    this.emit("debug", log);
    return log;
  }
}

export interface ClusterManager {
  emit: (<K extends keyof ClusterManagerEvents>(event: K, ...args: ClusterManagerEvents[K]) => boolean) &
  (<S extends string | symbol>(event: Exclude<S, keyof ClusterManagerEvents>, ...args: any[]) => boolean);
  off: (<K extends keyof ClusterManagerEvents>(
    event: K,
    listener: (...args: ClusterManagerEvents[K]) => void,
  ) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterManagerEvents>,
    listener: (...args: any[]) => void,
  ) => this);
  on: (<K extends keyof ClusterManagerEvents>(
    event: K,
    listener: (...args: ClusterManagerEvents[K]) => void,
  ) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterManagerEvents>,
    listener: (...args: any[]) => void,
  ) => this);
  once: (<K extends keyof ClusterManagerEvents>(
    event: K,
    listener: (...args: ClusterManagerEvents[K]) => void,
  ) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterManagerEvents>,
    listener: (...args: any[]) => void,
  ) => this);
  removeAllListeners: (<K extends keyof ClusterManagerEvents>(event?: K) => this) &
  (<S extends string | symbol>(event?: Exclude<S, keyof ClusterManagerEvents>) => this);
}
