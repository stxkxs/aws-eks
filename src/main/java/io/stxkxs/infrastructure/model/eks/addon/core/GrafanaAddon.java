package io.stxkxs.infrastructure.model.eks.addon.core;

import io.stxkxs.infrastructure.model.eks.HelmChart;

public record GrafanaAddon(
  HelmChart chart,
  String secret
) {}
