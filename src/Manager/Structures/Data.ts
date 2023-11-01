export function getInfo() {
  const shardList: number[] = [],
    parseShardList = process.env.SHARD_LIST?.split(",") || [];

  parseShardList.forEach(c => shardList.push(Number(c)));

  const data = {
    SHARD_LIST: shardList,
    TOTAL_SHARDS: Number(process.env.TOTAL_SHARDS),
    CLUSTER_COUNT: Number(process.env.CLUSTER_COUNT),
    CLUSTER: Number(process.env.CLUSTER),
    MAINTENANCE: process.env.MAINTENANCE,
    CLUSTER_QUEUE_MODE: process.env.CLUSTER_QUEUE_MODE,
    FIRST_SHARD_ID: shardList[0] as number,
    LAST_SHARD_ID: shardList[shardList.length - 1] as number
  } as ClusterClientData;

  return data;
}

export interface ClusterClientData {
  SHARD_LIST: number[];
  TOTAL_SHARDS: number;
  LAST_SHARD_ID: number;
  FIRST_SHARD_ID: number;
  CLUSTER_COUNT: number;
  MAINTENANCE?: string;
  CLUSTER_QUEUE_MODE?: string;
  CLUSTER: number;
}

export type ClusterManagerMode = "process" | "worker";
