package io.stxkxs.infrastructure.model.eks.addon.core;

public record GrafanaSecret(
  String instanceId,
  String key,
  String lokiHost,
  String lokiUsername,
  String prometheusHost,
  String prometheusUsername,
  String tempoHost,
  String tempoUsername,
  String pyroscopeHost,
  String fleetManagementHost
) {}
