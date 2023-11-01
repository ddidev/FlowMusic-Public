import type { Cluster } from "../Core/Cluster";

export class ClusterManagerHooks {
  constructClusterArgs(_cluster: Cluster, args: string[]) {
    return args;
  }
}