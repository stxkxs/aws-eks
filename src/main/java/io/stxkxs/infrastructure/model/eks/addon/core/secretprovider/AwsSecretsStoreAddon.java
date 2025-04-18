package io.stxkxs.infrastructure.model.eks.addon.core.secretprovider;

import io.stxkxs.infrastructure.model.eks.HelmChart;

public record AwsSecretsStoreAddon(
  HelmChart chart
) {}
