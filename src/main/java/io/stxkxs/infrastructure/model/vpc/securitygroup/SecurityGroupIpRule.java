package io.stxkxs.infrastructure.model.vpc.securitygroup;

public record SecurityGroupIpRule(
  String ip,
  int startPort,
  int endPort
) {}
