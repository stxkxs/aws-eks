package io.stxkxs.infrastructure.model.eks.addon.core.karpenter;

import io.stxkxs.infrastructure.model.eks.HelmChart;
import io.stxkxs.infrastructure.model.eks.PodIdentity;

public record KarpenterAddon(
  HelmChart chart,
  PodIdentity podIdentity
) {}
