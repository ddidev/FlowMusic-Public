import { Serializable } from "child_process";
import EventEmitter from "events";
import path from "path";

import { Child } from "../Structures/Child.js";
import { ClusterHandler } from "../Structures/IPCHandler.js";
import { BaseMessage, IPCMessage, RawMessage } from "../Structures/IPCMessage.js";
import { ClusterEvents, ClusterKillOptions, messageType } from "../types/shared";
import { delayFor, generateNonce } from "../Util/Util";
import { ClusterManager } from "./ClusterManager";

export class Cluster extends EventEmitter {
  THREAD: typeof Child;
  manager: ClusterManager;
  id: number;
  args: string[];
  execArgv: string[];
  shardList: number[];
  totalShards: number;
  env: NodeJS.ProcessEnv & {
    SHARD_LIST: number[];
    TOTAL_SHARDS: number;
    CLUSTER_MANAGER: boolean;
    CLUSTER: number;
    CLUSTER_COUNT: number;
    DISCORD_TOKEN: string;
  };
  thread: null | Child;
  restarts: {
    current: number;
    max: number;
    interval: number;
    reset?: NodeJS.Timer;
    resetRestarts: () => void;
    cleanup: () => void;
    append: () => void;
  };
  messageHandler: any;
  ready: boolean;

  constructor(manager: ClusterManager, id: number, shardList: number[], totalShards: number) {
    super();

    this.THREAD = Child;
    this.manager = manager;
    this.id = id;
    this.args = manager.shardArgs || [];
    this.execArgv = manager.execArgv;
    this.shardList = shardList;
    this.totalShards = totalShards;
    this.env = Object.assign({}, process.env, {
      SHARD_LIST: this.shardList,
      TOTAL_SHARDS: this.totalShards,
      CLUSTER_MANAGER: true,
      CLUSTER: this.id,
      CLUSTER_COUNT: this.manager.totalClusters,
      DISCORD_TOKEN: this.manager.token as string
    });
    this.ready = false;
    this.thread = null;
    this.restarts = {
      current: this.manager.restarts.current ?? 0,
      max: this.manager.restarts.max,
      interval: this.manager.restarts.interval,
      reset: undefined,
      resetRestarts: () =>
        this.restarts.reset = setInterval(() => {
          this.restarts.current = 0;
        }, this.manager.restarts.interval),
      cleanup: () => {
        if (this.restarts.reset) clearInterval(this.restarts.reset);
      },
      append: () => this.restarts.current++
    };
  }

  public async spawn(spawnTimeout = 30000) {
    if (this.thread) throw new Error("CLUSTER ALREADY SPAWNED | ClusterId: " + this.id);
    this.thread = new this.THREAD(path.resolve(this.manager.file), {
      ...this.manager.clusterOptions,
      execArgv: this.execArgv,
      env: this.env,
      args: this.manager.hooks.constructClusterArgs(this, this.args),
      clusterData: { ...this.env, ...this.manager.clusterData }
    });
    this.messageHandler = new ClusterHandler(this.manager, this, this.thread);

    this.thread
      .spawn()
      .on("message", this._handleMessage.bind(this))
      .on("exit", this._handleExit.bind(this))
      .on("error", this._handleError.bind(this));

    this.emit("spawn", this.thread.process);

    if (spawnTimeout === -1 || spawnTimeout === Infinity) return this.thread.process;

    await new Promise((resolve, reject) => {
      const cleanup = () => {
          clearTimeout(spawnTimeoutTimer);
          this.off("ready", onReady);
          this.off("death", onDeath);
        },
        onReady = () => {
          this.manager.emit("clusterReady", this);
          this.restarts.cleanup();
          this.restarts.resetRestarts();
          cleanup();
          resolve("Cluster is ready");
        },
        onDeath = () => {
          cleanup();
          reject(new Error("CLUSTERING_READY_DIED | ClusterId: " + this.id));
        },
        onTimeout = () => {
          cleanup();
          reject(new Error("CLUSTERING_READY_TIMEOUT | ClusterId: " + this.id + " | Timeout: " + spawnTimeout));
        },
        spawnTimeoutTimer = setTimeout(onTimeout, spawnTimeout);

      this.once("ready", onReady);
      this.once("death", onDeath);
    });
    return this.thread.process;
  }

  public kill(options: ClusterKillOptions) {
    this.thread?.kill();

    if (this.thread) this.thread = null;

    this.manager.heartbeat?.clusters.get(this.id)?.stop();
    this.restarts.cleanup();
    this.manager._debug("[KILL] Cluster killed with reason: " + (options?.reason || "not given"), this.id);
  }

  public async respawn({ delay = 500, timeout = 30000 } = this.manager.spawnOptions) {
    if (this.thread) this.kill({ force: true });
    if (delay > 0) await delayFor(delay);
    this.manager.heartbeat?.clusters.get(this.id)?.stop();
    return this.spawn(timeout);
  }

  public send(message: RawMessage) {
    if (typeof message === "object") this.thread?.send(new BaseMessage(message).toJSON());
    else return this.thread?.send(message);
  }

  public request(message: RawMessage) {
    message._type = messageType.CUSTOM_REQUEST;
    this.send(message);
    return this.manager.promise.create(message, message.options);
  }

  public async eval(script: Function | string, context: any, timeout: number) {
    const _eval = typeof script === "function" ? `(${script})(this, ${JSON.stringify(context)})` : script;

    if (!this.thread) return Promise.reject(new Error("CLUSTERING_NO_CHILD_EXISTS | ClusterId: " + this.id));

    const nonce = generateNonce(),
      message = { nonce, _eval, options: { timeout }, _type: messageType.CLIENT_EVAL_REQUEST };

    await this.send(message);
    return await this.manager.promise.create(message, message.options);
  }

  public triggerMaintenance(reason?: string) {
    const _type = reason ? messageType.CLIENT_MAINTENANCE_ENABLE : messageType.CLIENT_MAINTENANCE_DISABLE;
    return this.send({ _type, maintenance: reason });
  }

  private _handleMessage(message: Serializable) {
    if (!message) return;
    const emit = this.messageHandler.handleMessage(message);
    if (!emit) return;

    let emitMessage;
    if (typeof message === "object") {
      emitMessage = new IPCMessage(this, message);
      if (emitMessage._type === messageType.CUSTOM_REQUEST) this.manager.emit("clientRequest", emitMessage);
    } else emitMessage = message;

    this.emit("message", emitMessage);
  }

  private _handleExit() {
    const respawn = this.manager.respawn;

    this.manager.heartbeat?.clusters.get(this.id)?.stop();
    this.restarts.cleanup();

    this.emit("death", this, this.thread?.process);

    this.manager._debug(
      "[DEATH] Cluster died, attempting respawn | Restarts Left: " + (this.restarts.max - this.restarts.current),
      this.id
    );

    this.ready = false;

    this.thread = null;

    if (!respawn) return;

    if (this.restarts.current >= this.restarts.max)
      this.manager._debug(
        "[ATTEMPTED_RESPAWN] Attempted Respawn Declined | Max Restarts have been exceeded",
        this.id
      );

    if (this.restarts.current < this.restarts.max) this.spawn().catch(err => this.emit("error", err));

    this.restarts.append();
  }

  private _handleError(error: Error) {
    this.manager.emit("error", error);
  }
}
export interface Cluster {
  emit: (<K extends keyof ClusterEvents>(event: K, ...args: ClusterEvents[K]) => boolean) &
  (<S extends string | symbol>(event: Exclude<S, keyof ClusterEvents>, ...args: any[]) => boolean);

  off: (<K extends keyof ClusterEvents>(event: K, listener: (...args: ClusterEvents[K]) => void) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterEvents>,
    listener: (...args: any[]) => void,
  ) => this);

  on: (<K extends keyof ClusterEvents>(event: K, listener: (...args: ClusterEvents[K]) => void) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterEvents>,
    listener: (...args: any[]) => void,
  ) => this);

  once: (<K extends keyof ClusterEvents>(event: K, listener: (...args: ClusterEvents[K]) => void) => this) &
  (<S extends string | symbol>(
    event: Exclude<S, keyof ClusterEvents>,
    listener: (...args: any[]) => void,
  ) => this);

  removeAllListeners: (<K extends keyof ClusterEvents>(event?: K) => this) &
  (<S extends string | symbol>(event?: Exclude<S, keyof ClusterEvents>) => this);
}
