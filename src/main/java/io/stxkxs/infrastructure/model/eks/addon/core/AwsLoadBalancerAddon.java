package io.stxkxs.infrastructure.model.eks.addon.core;

import io.stxkxs.infrastructure.model.eks.HelmChart;
import io.stxkxs.infrastructure.model.eks.ServiceAccountConf;

public record AwsLoadBalancerAddon(
  HelmChart chart,
  ServiceAccountConf serviceAccount
) {}
