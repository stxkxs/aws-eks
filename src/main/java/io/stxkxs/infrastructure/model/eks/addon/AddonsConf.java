package io.stxkxs.infrastructure.model.eks.addon;

import io.stxkxs.infrastructure.model.eks.addon.core.AwsLoadBalancerAddon;
import io.stxkxs.infrastructure.model.eks.addon.core.CertManagerAddon;
import io.stxkxs.infrastructure.model.eks.addon.core.GrafanaAddon;
import io.stxkxs.infrastructure.model.eks.addon.core.karpenter.KarpenterAddon;
import io.stxkxs.infrastructure.model.eks.addon.core.secretprovider.AwsSecretsStoreAddon;
import io.stxkxs.infrastructure.model.eks.addon.core.secretprovider.CsiSecretsStoreAddon;
import io.stxkxs.infrastructure.model.eks.addon.managed.ManagedAddons;

public record AddonsConf(
  ManagedAddons managed,
  CsiSecretsStoreAddon csiSecretsStore,
  AwsSecretsStoreAddon awsSecretsStore,
  AwsLoadBalancerAddon awsLoadBalancer,
  CertManagerAddon certManager,
  KarpenterAddon karpenter,
  GrafanaAddon grafana
) {}
