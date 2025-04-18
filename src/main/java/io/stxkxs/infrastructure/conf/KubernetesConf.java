package io.stxkxs.infrastructure.conf;

import lombok.Builder;

import java.util.List;
import java.util.Map;

@Builder
public record KubernetesConf(
  String name,
  String version,
  String endpointAccess,
  boolean prune,
  List<String> vpcSubnetTypes,
  List<String> loggingTypes,
  String rbac,
  String tenancy,
  String addons,
  String nodeGroups,
  String sqs,
  String observability,
  Map<String, String> annotations,
  Map<String, String> labels,
  Map<String, String> tags
) {}