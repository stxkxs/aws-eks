package io.stxkxs.infrastructure.model.eks.addon.core;

import io.stxkxs.infrastructure.model.eks.HelmChart;

public record CertManagerAddon(
  HelmChart chart
) {}
