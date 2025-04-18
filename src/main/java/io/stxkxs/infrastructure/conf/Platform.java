package io.stxkxs.infrastructure.conf;

import io.stxkxs.infrastructure.model.vpc.NetworkConf;

public record Platform(
  Common common,
  NetworkConf vpc,
  KubernetesConf eks
) {}
