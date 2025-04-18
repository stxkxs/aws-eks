package io.stxkxs.infrastructure.model.eks;

public record HelmChart(
  String name,
  String namespace,
  String release,
  String repository,
  String values,
  String version
) {}
